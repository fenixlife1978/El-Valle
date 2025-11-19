

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, doc, runTransaction, query, orderBy, Timestamp, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, CheckSquare, Vote, BarChart3, Users, Lock, Timer, Play, CalendarOff, ArrowLeft } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useRouter } from 'next/navigation';

type SurveyQuestion = {
    id: string;
    questionText: string;
    options: string[];
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
    totalVotes: number; // Total number of users who have voted
};

type SurveyResponse = {
    surveyId: string;
    userId: string;
    votedAt: Timestamp;
    // selectedOption is now an object
    responses: {
        [questionId: string]: string; // questionId -> selectedOptionText
    };
};

const getSurveyStatus = (survey: Survey): { status: 'Programada' | 'Activa' | 'Cerrada'; variant: 'warning' | 'success' | 'destructive', icon: React.ElementType } => {
    const now = new Date();
    const startDate = survey.startDate.toDate();
    const endDate = survey.endDate.toDate();

    if (now < startDate) {
        return { status: 'Programada', variant: 'warning', icon: Timer };
    }
    if (now > endDate) {
        return { status: 'Cerrada', variant: 'destructive', icon: Lock };
    }
    return { status: 'Activa', variant: 'success', icon: Play };
};

export default function OwnerSurveysPage() {
    const { user, loading: authLoading } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const [surveys, setSurveys] = useState<Survey[]>([]);
    const [userVotes, setUserVotes] = useState<{ [key: string]: SurveyResponse }>( // surveyId -> SurveyResponse
        {}
    );
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            setLoading(false);
            return;
        }

        const surveysQuery = query(collection(db(), "surveys"), orderBy("createdAt", "desc"));
        const surveysUnsubscribe = onSnapshot(surveysQuery, (snapshot) => {
            const surveysData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Survey));
            setSurveys(surveysData);
            setLoading(false);
        });

        const responsesQuery = query(collection(db(), "survey_responses"), where("userId", "==", user.uid));
        const responsesUnsubscribe = onSnapshot(responsesQuery, (snapshot) => {
            const votes: { [key: string]: SurveyResponse } = {};
            snapshot.forEach(doc => {
                const data = doc.data() as SurveyResponse;
                votes[data.surveyId] = data;
            });
            setUserVotes(votes);
        });

        return () => {
            surveysUnsubscribe();
            responsesUnsubscribe();
        };
    }, [user, authLoading]);

    const handleVote = async (survey: Survey, responses: { [questionId: string]: string }) => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Error de autenticación' });
            return;
        }

        if (Object.keys(responses).length !== survey.questions.length) {
            toast({ variant: 'destructive', title: 'Respuestas incompletas', description: 'Por favor, responde a todas las preguntas de la encuesta.' });
            return;
        }

        const { status } = getSurveyStatus(survey);
        if (status !== 'Activa') {
            toast({ variant: 'destructive', title: 'Encuesta no activa', description: 'Esta encuesta no está disponible para votar en este momento.' });
            return;
        }

        try {
            await runTransaction(db(), async (transaction) => {
                const surveyRef = doc(db(), 'surveys', survey.id);
                const responseRef = doc(db(), 'survey_responses', `${user.uid}_${survey.id}`);

                const responseDoc = await transaction.get(responseRef);
                if (responseDoc.exists()) {
                    throw new Error("Ya has votado en esta encuesta.");
                }

                transaction.set(responseRef, {
                    surveyId: survey.id,
                    userId: user.uid,
                    responses,
                    votedAt: Timestamp.now(),
                });

                const surveyDoc = await transaction.get(surveyRef);
                if (!surveyDoc.exists()) {
                    throw new Error("La encuesta ya no existe.");
                }
                
                const currentData = surveyDoc.data();
                const currentResults = currentData.results || {};
                const currentTotalVotes = currentData.totalVotes || 0;
                
                const newResults = { ...currentResults };
                Object.entries(responses).forEach(([questionId, selectedOption]) => {
                    if (!newResults[questionId]) newResults[questionId] = {};
                    newResults[questionId][selectedOption] = (newResults[questionId][selectedOption] || 0) + 1;
                });

                transaction.update(surveyRef, {
                    results: newResults,
                    totalVotes: currentTotalVotes + 1,
                });
            });

            toast({ title: 'Voto registrado', description: '¡Gracias por participar!' });

        } catch (error: any) {
            console.error("Error submitting vote:", error);
            toast({ variant: 'destructive', title: 'Error al votar', description: error.message });
        }
    };
    
    if (loading || authLoading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }

    return (
        <div className="space-y-8">
            
            <div>
                <h1 className="text-3xl font-bold font-headline">Encuestas y Votaciones</h1>
                <p className="text-muted-foreground">Participa en las decisiones de la comunidad.</p>
            </div>

            {surveys.length === 0 ? (
                 <Card>
                    <CardContent className="h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <CheckSquare className="h-8 w-8"/>
                        <span>No hay encuestas activas en este momento.</span>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    {surveys.map(survey => {
                        const userVoteResponse = userVotes[survey.id];
                        const { status, variant, icon: StatusIcon } = getSurveyStatus(survey);
                        return (
                            <Card key={survey.id}>
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <CardTitle>{survey.title}</CardTitle>
                                        <Badge variant={variant}><StatusIcon className="mr-2 h-4 w-4"/>{status}</Badge>
                                    </div>
                                     <CardDescription>
                                        Período de votación: {format(survey.startDate.toDate(), "dd/MM/yy HH:mm")}h - {format(survey.endDate.toDate(), "dd/MM/yy HH:mm")}h
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {userVoteResponse ? (
                                        <div className="space-y-6">
                                            <div className="flex items-center gap-2 text-sm font-semibold pt-2">
                                                <Users className="h-4 w-4"/> Participantes Totales: {survey.totalVotes}
                                            </div>
                                            {survey.questions.map(q => {
                                                const questionResults = survey.results[q.id] || {};
                                                const questionTotalVotes = Object.values(questionResults).reduce((sum, count) => sum + count, 0);
                                                const userChoice = userVoteResponse.responses[q.id];

                                                return (
                                                    <div key={q.id}>
                                                         <Separator className="my-4"/>
                                                        <h3 className="font-semibold flex items-center gap-2 mb-3"><BarChart3 className="h-5 w-5"/> {q.questionText}</h3>
                                                        <p className="text-sm text-green-600 mb-3">✓ Votaste por: <span className="font-bold">{userChoice}</span></p>
                                                        <div className="space-y-3">
                                                            {q.options.map(option => {
                                                                const votes = questionResults[option] || 0;
                                                                const percentage = questionTotalVotes > 0 ? (votes / questionTotalVotes) * 100 : 0;
                                                                return (
                                                                     <div key={option} className="space-y-1">
                                                                        <div className="flex justify-between items-center text-sm">
                                                                            <span className="font-medium">{option}</span>
                                                                            <span className="text-muted-foreground">{votes} voto(s) ({percentage.toFixed(1)}%)</span>
                                                                        </div>
                                                                        <Progress value={percentage} />
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <SurveyForm survey={survey} onVote={handleVote} status={status} />
                                    )}
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    );
}

function SurveyForm({ survey, onVote, status }: { survey: Survey, onVote: (survey: Survey, responses: {[qId: string]: string}) => void, status: 'Programada' | 'Activa' | 'Cerrada' }) {
    const [selectedOptions, setSelectedOptions] = useState<{ [key: string]: string }>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleOptionChange = (questionId: string, option: string) => {
        setSelectedOptions(prev => ({ ...prev, [questionId]: option }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (Object.keys(selectedOptions).length !== survey.questions.length) {
            return;
        }
        setIsSubmitting(true);
        await onVote(survey, selectedOptions);
        setIsSubmitting(false);
    };

    const isVotingDisabled = status !== 'Activa' || isSubmitting;
    
    let StatusMessageIcon: React.ElementType | null = null;
    let statusMessage = "";

    if (status === 'Programada') {
        StatusMessageIcon = Timer;
        statusMessage = `La votación comenzará el ${format(survey.startDate.toDate(), "dd/MM/yyyy 'a las' HH:mm")}h.`;
    } else if (status === 'Cerrada') {
        StatusMessageIcon = CalendarOff;
        statusMessage = "La votación para esta encuesta ha finalizado.";
    }


    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {survey.questions.map(q => (
                 <div key={q.id}>
                    <h3 className="font-semibold mb-3">{q.questionText}</h3>
                    <RadioGroup
                        value={selectedOptions[q.id]}
                        onValueChange={(value) => handleOptionChange(q.id, value)}
                        disabled={isVotingDisabled}
                    >
                        {q.options.map((option) => (
                            <div key={option} className="flex items-center space-x-3 p-3 border rounded-md has-[:disabled]:opacity-50 has-[:disabled]:cursor-not-allowed hover:bg-muted/50">
                                <RadioGroupItem value={option} id={`${q.id}-${option}`} disabled={isVotingDisabled} />
                                <Label htmlFor={`${q.id}-${option}`} className="font-normal cursor-pointer flex-grow">{option}</Label>
                            </div>
                        ))}
                    </RadioGroup>
                </div>
            ))}
            
            {status !== 'Activa' && StatusMessageIcon && (
                 <div className="p-3 bg-muted/50 border rounded-md text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <StatusMessageIcon className="h-4 w-4"/>
                    <span>{statusMessage}</span>
                </div>
            )}

            <Button type="submit" disabled={Object.keys(selectedOptions).length !== survey.questions.length || isVotingDisabled}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Vote className="mr-2 h-4 w-4"/>}
                Enviar Votos
            </Button>
        </form>
    );
}

    