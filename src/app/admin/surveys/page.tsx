
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, addDoc, doc, deleteDoc, serverTimestamp, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PlusCircle, Trash2, Loader2, ListPlus, XCircle, BarChart3, Users, CheckSquare, CalendarIcon } from 'lucide-react';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

type SurveyQuestion = {
    id: string;
    questionText: string;
    options: { id: string, text: string }[];
};

type Survey = {
    id: string;
    title: string;
    questions: SurveyQuestion[];
    createdAt: Timestamp;
    startDate: Timestamp;
    endDate: Timestamp;
    results: {
        [questionId: string]: {
            [optionText: string]: number;
        };
    };
    totalVotes: number;
};

const getSurveyStatus = (survey: Survey): { status: 'Programada' | 'Activa' | 'Cerrada'; variant: 'warning' | 'success' | 'destructive' } => {
    const now = new Date();
    const startDate = survey.startDate.toDate();
    const endDate = survey.endDate.toDate();

    if (now < startDate) {
        return { status: 'Programada', variant: 'warning' };
    }
    if (now > endDate) {
        return { status: 'Cerrada', variant: 'destructive' };
    }
    return { status: 'Activa', variant: 'success' };
};


export default function SurveysPage() {
    const { toast } = useToast();
    const [surveys, setSurveys] = useState<Survey[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [questions, setQuestions] = useState<SurveyQuestion[]>([
        { id: `q-${Date.now()}`, questionText: '', options: [{ id: `opt-${Date.now()}-1`, text: '' }, { id: `opt-${Date.now()}-2`, text: '' }] }
    ]);
    const [startDate, setStartDate] = useState<Date | undefined>(new Date());
    const [startTime, setStartTime] = useState(format(new Date(), 'HH:mm'));
    const [endDate, setEndDate] = useState<Date | undefined>();
    const [endTime, setEndTime] = useState('23:59');

    
    const [surveyToDelete, setSurveyToDelete] = useState<Survey | null>(null);
    const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
    
    useEffect(() => {
        const q = query(collection(db, "surveys"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const surveysData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Survey));
            setSurveys(surveysData);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const resetDialog = () => {
        setIsDialogOpen(false);
        setTitle('');
        setQuestions([
            { id: `q-${Date.now()}`, questionText: '', options: [{ id: `opt-${Date.now()}-1`, text: '' }, { id: `opt-${Date.now()}-2`, text: '' }] }
        ]);
        setStartDate(new Date());
        setStartTime(format(new Date(), 'HH:mm'));
        setEndDate(undefined);
        setEndTime('23:59');
    };

    const handleQuestionTextChange = (id: string, text: string) => {
        setQuestions(questions.map(q => q.id === id ? { ...q, questionText: text } : q));
    };

    const handleOptionChange = (questionId: string, optionId: string, text: string) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId) {
                const updatedOptions = q.options.map(opt => opt.id === optionId ? { ...opt, text } : opt);
                return { ...q, options: updatedOptions };
            }
            return q;
        }));
    };
    
    const addOption = (questionId: string) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId) {
                return { ...q, options: [...q.options, { id: `opt-${Date.now()}`, text: '' }] };
            }
            return q;
        }));
    };

    const removeOption = (questionId: string, optionId: string) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId) {
                if (q.options.length > 2) {
                    return { ...q, options: q.options.filter(opt => opt.id !== optionId) };
                } else {
                    toast({ variant: 'destructive', title: 'Mínimo de opciones', description: 'Una pregunta debe tener al menos dos opciones.' });
                }
            }
            return q;
        }));
    };

    const addQuestion = () => {
        setQuestions([...questions, {
            id: `q-${Date.now()}`,
            questionText: '',
            options: [{ id: `opt-${Date.now()}-1`, text: '' }, { id: `opt-${Date.now()}-2`, text: '' }]
        }]);
    };

    const removeQuestion = (id: string) => {
        if (questions.length > 1) {
            setQuestions(questions.filter(q => q.id !== id));
        } else {
            toast({ variant: 'destructive', title: 'Mínimo de preguntas', description: 'Una encuesta debe tener al menos una pregunta.' });
        }
    };
    
    const handleSaveSurvey = async () => {
        if (!title.trim()) {
            toast({ variant: 'destructive', title: 'Título requerido', description: 'Por favor, ingrese un título para la encuesta.' });
            return;
        }
        if (questions.some(q => !q.questionText.trim())) {
             toast({ variant: 'destructive', title: 'Preguntas incompletas', description: 'Todas las preguntas deben tener texto.' });
            return;
        }
        if (questions.some(q => q.options.filter(o => o.text.trim() !== '').length < 2)) {
             toast({ variant: 'destructive', title: 'Opciones insuficientes', description: 'Cada pregunta debe tener al menos dos opciones con texto.' });
            return;
        }
        if (!startDate || !endDate || !startTime || !endTime) {
            toast({ variant: 'destructive', title: 'Fechas requeridas', description: 'Debe definir una fecha y hora de inicio y fin.' });
            return;
        }

        const startDateTime = parse(`${format(startDate, 'yyyy-MM-dd')} ${startTime}`, 'yyyy-MM-dd HH:mm', new Date());
        const endDateTime = parse(`${format(endDate, 'yyyy-MM-dd')} ${endTime}`, 'yyyy-MM-dd HH:mm', new Date());

        if (startDateTime >= endDateTime) {
            toast({ variant: 'destructive', title: 'Fechas inválidas', description: 'La fecha de inicio debe ser anterior a la fecha de cierre.' });
            return;
        }
        
        setIsSubmitting(true);
        try {
            const finalQuestions = questions.map(q => ({
                id: q.id,
                questionText: q.questionText,
                options: q.options.filter(opt => opt.text.trim() !== '').map(opt => opt.text)
            }));
            
            const initialResults: Survey['results'] = {};
            finalQuestions.forEach(q => {
                initialResults[q.id] = q.options.reduce((acc, opt) => {
                    acc[opt] = 0;
                    return acc;
                }, {} as { [key: string]: number });
            });


            await addDoc(collection(db, 'surveys'), {
                title,
                questions: finalQuestions,
                createdAt: serverTimestamp(),
                startDate: Timestamp.fromDate(startDateTime),
                endDate: Timestamp.fromDate(endDateTime),
                results: initialResults,
                totalVotes: 0, // This is now total survey participants, not total votes cast
            });

            toast({ title: 'Encuesta Creada', description: 'La nueva encuesta está disponible para los propietarios.' });
            resetDialog();
        } catch (error) {
            console.error('Error creating survey:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo crear la encuesta.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteSurvey = async () => {
        if (!surveyToDelete) return;
        try {
            await deleteDoc(doc(db, "surveys", surveyToDelete.id));
            toast({ title: 'Encuesta Eliminada' });
        } catch (error) {
            console.error("Error deleting survey:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la encuesta.' });
        } finally {
            setSurveyToDelete(null);
            setIsDeleteConfirmationOpen(false);
        }
    };
    
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold font-headline">Gestión de Encuestas</h1>
                    <p className="text-muted-foreground">Crea y gestiona encuestas para la comunidad.</p>
                </div>
                <Button onClick={() => setIsDialogOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Crear Nueva Encuesta
                </Button>
            </div>
            
            {loading ? (
                <div className="flex justify-center items-center h-64"><Loader2 className="h-10 w-10 animate-spin text-primary"/></div>
            ) : surveys.length === 0 ? (
                <Card>
                    <CardContent className="h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <CheckSquare className="h-8 w-8"/>
                        <span>No hay encuestas creadas.</span>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {surveys.map(survey => {
                        const { status, variant } = getSurveyStatus(survey);
                        return (
                            <Card key={survey.id} className="flex flex-col">
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <CardTitle>{survey.title}</CardTitle>
                                        <Badge variant={variant}>{status}</Badge>
                                    </div>
                                    <CardDescription>
                                        Inicia: {format(survey.startDate.toDate(), "dd/MM/yy HH:mm")}h <br />
                                        Cierra: {format(survey.endDate.toDate(), "dd/MM/yy HH:mm")}h
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex-grow space-y-4">
                                     <div className="flex items-center gap-2 text-sm font-semibold">
                                        <Users className="h-4 w-4"/> Participantes Totales: {survey.totalVotes}
                                    </div>
                                    <Separator />
                                    <div className="space-y-6">
                                        {survey.questions.map(q => {
                                            const questionResults = survey.results[q.id] || {};
                                            const questionTotalVotes = Object.values(questionResults).reduce((sum, count) => sum + count, 0);

                                            return (
                                                <div key={q.id}>
                                                    <h4 className="font-semibold mb-3">{q.questionText}</h4>
                                                    <div className="space-y-3">
                                                        {Object.entries(questionResults).sort(([, a], [, b]) => b - a).map(([option, votes]) => {
                                                            const percentage = questionTotalVotes > 0 ? (votes / questionTotalVotes) * 100 : 0;
                                                            return (
                                                                <div key={option} className="space-y-1">
                                                                    <div className="flex justify-between items-center text-sm">
                                                                        <span className="font-medium">{option}</span>
                                                                        <span className="text-muted-foreground">{votes} voto(s) ({percentage.toFixed(1)}%)</span>
                                                                    </div>
                                                                    <Progress value={percentage} />
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </CardContent>
                                <CardFooter className="border-t pt-4">
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => {
                                            setSurveyToDelete(survey);
                                            setIsDeleteConfirmationOpen(true);
                                        }}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Eliminar Encuesta
                                    </Button>
                                </CardFooter>
                            </Card>
                        )
                    })}
                </div>
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Crear Nueva Encuesta</DialogTitle>
                        <DialogDescription>
                            Define el título, las preguntas, las opciones y el período de votación.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-grow space-y-6 overflow-y-auto pr-6 -mr-6">
                        <div className="space-y-2">
                            <Label htmlFor="title">Título de la Encuesta</Label>
                            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Mejoras para el área de la piscina" />
                        </div>

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Fecha de Inicio</Label>
                                <div className="flex gap-2">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant={"outline"} className={cn("flex-grow justify-start", !startDate && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {startDate ? format(startDate, "dd/MM/yyyy") : <span>Seleccionar</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus locale={es} /></PopoverContent>
                                    </Popover>
                                    <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-[100px]" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Fecha de Cierre</Label>
                                <div className="flex gap-2">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant={"outline"} className={cn("flex-grow justify-start", !endDate && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {endDate ? format(endDate, "dd/MM/yyyy") : <span>Seleccionar</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus locale={es} /></PopoverContent>
                                    </Popover>
                                     <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-[100px]" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Label className="text-lg font-semibold">Preguntas</Label>
                            {questions.map((q, qIndex) => (
                                <Card key={q.id} className="bg-muted/50 p-4">
                                     <div className="flex justify-between items-center mb-4">
                                        <h4 className="font-semibold">Pregunta {qIndex + 1}</h4>
                                        <Button variant="ghost" size="icon" onClick={() => removeQuestion(q.id)} disabled={questions.length <= 1}>
                                            <Trash2 className="h-5 w-5 text-destructive" />
                                        </Button>
                                    </div>
                                    <div className="space-y-2">
                                        <Input value={q.questionText} onChange={e => handleQuestionTextChange(q.id, e.target.value)} placeholder="Texto de la pregunta..." />
                                    </div>
                                    <div className="space-y-2 mt-4 pl-4 border-l-2">
                                        <Label>Opciones</Label>
                                         {q.options.map((option, optIndex) => (
                                            <div key={option.id} className="flex items-center gap-2">
                                                <Input value={option.text} onChange={e => handleOptionChange(q.id, option.id, e.target.value)} placeholder={`Opción ${optIndex + 1}`} />
                                                <Button variant="ghost" size="icon" onClick={() => removeOption(q.id, option.id)} disabled={q.options.length <= 2}>
                                                    <XCircle className="h-5 w-5 text-destructive/70" />
                                                </Button>
                                            </div>
                                        ))}
                                        <Button variant="outline" size="sm" onClick={() => addOption(q.id)}>
                                            <ListPlus className="mr-2 h-4 w-4" /> Añadir Opción
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                             <Button variant="secondary" onClick={addQuestion}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Añadir Pregunta
                            </Button>
                        </div>
                    </div>
                    <DialogFooter className="mt-auto pt-4 border-t">
                        <Button variant="outline" onClick={resetDialog}>Cancelar</Button>
                        <Button onClick={handleSaveSurvey} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Encuesta
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteConfirmationOpen} onOpenChange={setIsDeleteConfirmationOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirmar Eliminación</DialogTitle>
                        <DialogDescription>
                            ¿Está seguro de que desea eliminar esta encuesta? Esta acción es permanente y no se puede deshacer.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteConfirmationOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleDeleteSurvey}>Eliminar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
