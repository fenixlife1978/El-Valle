
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, doc, setDoc, runTransaction, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, CheckSquare, Vote, BarChart3, Users } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

type Survey = {
    id: string;
    question: string;
    options: string[];
    createdAt: Timestamp;
    results: { [key: string]: number };
    totalVotes: number;
};

type SurveyResponse = {
    surveyId: string;
    userId: string;
    selectedOption: string;
    votedAt: Timestamp;
};

export default function OwnerSurveysPage() {
    const { user, loading: authLoading } = useAuth();
    const { toast } = useToast();

    const [surveys, setSurveys] = useState<Survey[]>([]);
    const [userVotes, setUserVotes] = useState<{ [key: string]: string }>({}); // surveyId -> selectedOption
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            setLoading(false);
            return;
        }

        const surveysQuery = query(collection(db, "surveys"), orderBy("createdAt", "desc"));
        const surveysUnsubscribe = onSnapshot(surveysQuery, (snapshot) => {
            const surveysData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Survey));
            setSurveys(surveysData);
            setLoading(false);
        });

        const responsesQuery = query(collection(db, "survey_responses"), where("userId", "==", user.uid));
        const responsesUnsubscribe = onSnapshot(responsesQuery, (snapshot) => {
            const votes: { [key: string]: string } = {};
            snapshot.forEach(doc => {
                const data = doc.data() as SurveyResponse;
                votes[data.surveyId] = data.selectedOption;
            });
            setUserVotes(votes);
        });

        return () => {
            surveysUnsubscribe();
            responsesUnsubscribe();
        };
    }, [user, authLoading]);

    const handleVote = async (surveyId: string, option: string) => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Error de autenticación' });
            return;
        }

        try {
            const surveyRef = doc(db, 'surveys', surveyId);
            const responseRef = doc(db, 'survey_responses', `${user.uid}_${surveyId}`);

            await runTransaction(db, async (transaction) => {
                const responseDoc = await transaction.get(responseRef);
                if (responseDoc.exists()) {
                    throw new Error("Ya has votado en esta encuesta.");
                }

                transaction.set(responseRef, {
                    surveyId,
                    userId: user.uid,
                    selectedOption: option,
                    votedAt: Timestamp.now(),
                });

                const surveyDoc = await transaction.get(surveyRef);
                if (!surveyDoc.exists()) {
                    throw new Error("La encuesta ya no existe.");
                }

                const currentResults = surveyDoc.data().results || {};
                const currentTotalVotes = surveyDoc.data().totalVotes || 0;

                transaction.update(surveyRef, {
                    [`results.${option}`]: (currentResults[option] || 0) + 1,
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
                        const userVote = userVotes[survey.id];
                        return (
                            <Card key={survey.id}>
                                <CardHeader>
                                    <CardTitle>{survey.question}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {userVote ? (
                                        <div className="space-y-4">
                                            <h3 className="font-semibold flex items-center gap-2"><BarChart3 className="h-5 w-5"/>Resultados Actuales</h3>
                                            <p className="text-sm text-green-600">✓ Votaste por: <span className="font-bold">{userVote}</span></p>
                                            <div className="space-y-3">
                                                 {Object.entries(survey.results).sort(([, a], [, b]) => b - a).map(([option, votes]) => {
                                                    const percentage = survey.totalVotes > 0 ? (votes / survey.totalVotes) * 100 : 0;
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
                                            <div className="flex items-center gap-2 text-sm font-semibold pt-2 border-t mt-4">
                                                <Users className="h-4 w-4"/> Votos Totales: {survey.totalVotes}
                                            </div>
                                        </div>
                                    ) : (
                                        <SurveyForm survey={survey} onVote={handleVote} />
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

function SurveyForm({ survey, onVote }: { survey: Survey, onVote: (surveyId: string, option: string) => void }) {
    const [selectedOption, setSelectedOption] = useState<string | undefined>(undefined);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOption) {
            return;
        }
        setIsSubmitting(true);
        await onVote(survey.id, selectedOption);
        setIsSubmitting(false);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <RadioGroup value={selectedOption} onValueChange={setSelectedOption}>
                {survey.options.map((option) => (
                    <div key={option} className="flex items-center space-x-3 p-3 border rounded-md hover:bg-muted/50">
                        <RadioGroupItem value={option} id={`${survey.id}-${option}`} />
                        <Label htmlFor={`${survey.id}-${option}`} className="font-normal cursor-pointer flex-grow">{option}</Label>
                    </div>
                ))}
            </RadioGroup>
            <Button type="submit" disabled={!selectedOption || isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Vote className="mr-2 h-4 w-4"/>}
                Enviar Voto
            </Button>
        </form>
    );
}
