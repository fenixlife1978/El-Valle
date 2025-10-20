
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Palette } from 'lucide-react';
import { ColorPicker } from '@/components/color-picker';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Helper function to convert hex to HSL string
const hexToHsl = (hex: string): string => {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    h = Math.round(h * 360);
    s = Math.round(s * 100);
    l = Math.round(l * 100);

    return `${h} ${s}% ${l}%`;
};

// Helper function to convert HSL string to hex
const hslToHex = (hslStr: string): string => {
    const [h, s, l] = hslStr.split(' ').map(val => parseInt(val.replace('%', '')));
    const sNorm = s / 100;
    const lNorm = l / 100;
    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = lNorm - c / 2;
    let r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) { [r, g, b] = [c, x, 0]; } 
    else if (h >= 60 && h < 120) { [r, g, b] = [x, c, 0]; } 
    else if (h >= 120 && h < 180) { [r, g, b] = [0, c, x]; } 
    else if (h >= 180 && h < 240) { [r, g, b] = [0, x, c]; } 
    else if (h >= 240 && h < 300) { [r, g, b] = [x, 0, c]; } 
    else if (h >= 300 && h < 360) { [r, g, b] = [c, 0, x]; }
    
    const toHex = (c: number) => Math.round((c + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

type ThemeColors = {
    background: string;
    foreground: string;
    card: string;
    primary: string;
};

export default function AppearancePage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [themeColors, setThemeColors] = useState<ThemeColors>({
        background: '#F57C00', // Orange
        foreground: '#000000', // Black
        card: '#1B5E20',       // Dark Green
        primary: '#1976D2',      // Blue (default)
    });
    
    useEffect(() => {
        const fetchTheme = async () => {
            setLoading(true);
            try {
                const settingsRef = doc(db, 'config', 'theme');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setThemeColors({
                        background: hslToHex(data.background || '24 95% 53%'),
                        foreground: hslToHex(data.foreground || '224 71% 4%'),
                        card: hslToHex(data.card || '141 53% 24%'),
                        primary: hslToHex(data.primary || '217 91% 60%'),
                    });
                }
            } catch (e) {
                console.error("Error fetching theme:", e);
                toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar el tema guardado.' });
            } finally {
                setLoading(false);
            }
        };
        fetchTheme();
    }, [toast]);
    
    const handleColorChange = (colorName: keyof ThemeColors, color: string) => {
        setThemeColors(prev => ({...prev, [colorName]: color }));
    };

    const handleSaveChanges = async () => {
        setSaving(true);
        try {
            const themeRef = doc(db, 'config', 'theme');
            const hslTheme = {
                background: hexToHsl(themeColors.background),
                foreground: hexToHsl(themeColors.foreground),
                card: hexToHsl(themeColors.card),
                primary: hexToHsl(themeColors.primary),
            };
            await setDoc(themeRef, hslTheme);

            // This part is a placeholder for actually updating the CSS file.
            // In a real scenario, this would trigger a server-side process
            // or the styles would be loaded dynamically from the DB.
            // For this prototype, we'll simulate the change.
            const cssContent = `
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: ${hslTheme.background};
    --foreground: ${hslTheme.foreground};

    --card: ${hslTheme.card};
    --card-foreground: ${hslTheme.foreground};

    --popover: ${hslTheme.card};
    --popover-foreground: ${hslTheme.foreground};

    --primary: ${hslTheme.primary};
    --primary-foreground: 0 0% 98%;

    --secondary: 210 40% 91%;
    --secondary-foreground: 224 71% 4%;

    --muted: 210 40% 91%;
    --muted-foreground: 220 14% 45%;
    
    --accent: 45 93% 47%; /* Yellow */
    --accent-foreground: 224 71% 4%;

    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 98%;
    
    --success: 142 71% 41%;
    --success-foreground: 0 0% 98%;
    
    --warning: 38 92% 50%;
    --warning-foreground: 0 0% 98%;

    --border: 210 40% 89%;
    --input: 210 40% 89%;
    --ring: ${hslTheme.primary};

    --radius: 0.5rem;
    
    --chart-1: ${hslTheme.primary};
    --chart-2: 45 93% 47%;
    --chart-3: 24 95% 53%;
    --chart-4: 142 71% 41%;
    --chart-5: 280 80% 60%;
    
    --sidebar-background: 224 71% 4%;
    --sidebar-foreground: 0 0% 98%;
    --sidebar-primary: ${hslTheme.primary};
    --sidebar-primary-foreground: 0 0% 98%;
    --sidebar-accent: 224 71% 14%;
    --sidebar-accent-foreground: 0 0% 98%;
    --sidebar-border: 224 71% 10%;
    --sidebar-ring: ${hslTheme.primary};
  }

  .dark {
    --background: ${hslTheme.background};
    --foreground: ${hslTheme.foreground};

    --card: ${hslTheme.card};
    --card-foreground: ${hslTheme.foreground};

    --popover: ${hslTheme.card};
    --popover-foreground: ${hslTheme.foreground};

    --primary: ${hslTheme.primary};
    --primary-foreground: 0 0% 98%;

    --secondary: 224 71% 14%;
    --secondary-foreground: 0 0% 98%;

    --muted: 224 71% 14%;
    --muted-foreground: 220 14% 65%;

    --accent: 45 93% 47%;
    --accent-foreground: 224 71% 4%;
    
    --destructive: 0 63% 31%;
    --destructive-foreground: 0 0% 98%;

    --success: 142 71% 41%;
    --success-foreground: 0 0% 98%;

    --warning: 38 92% 50%;
    --warning-foreground: 0 0% 98%;

    --border: 224 71% 14%;
    --input: 224 71% 14%;
    --ring: ${hslTheme.primary};
    
    --sidebar-background: ${hslTheme.card};
    --sidebar-foreground: ${hslTheme.foreground};
    --sidebar-primary: ${hslTheme.primary};
    --sidebar-primary-foreground: 0 0% 98%;
    --sidebar-accent: 224 71% 14%;
    --sidebar-accent-foreground: 0 0% 98%;
    --sidebar-border: 224 71% 10%;
    --sidebar-ring: ${hslTheme.primary};
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
            `;
            // This is a placeholder for updating the file. The XML change below is the real mechanism.
            console.log("CSS would be updated to:", cssContent);


            toast({ title: 'Tema Guardado', description: 'Los colores de la aplicación han sido actualizados.' });

        } catch (e) {
            console.error("Error saving theme:", e);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el nuevo tema.' });
        } finally {
            setSaving(false);
        }
    };


    if (loading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    }

    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Palette/> Apariencia</CardTitle>
                    <CardDescription>Personaliza los colores de la aplicación.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    <ColorPicker 
                        label="Color del Texto Principal"
                        color={themeColors.foreground}
                        onChange={(color) => handleColorChange('foreground', color)}
                    />
                    <ColorPicker 
                        label="Color de Fondo Principal"
                        color={themeColors.background}
                        onChange={(color) => handleColorChange('background', color)}
                    />
                    <ColorPicker 
                        label="Color de Fondo de Tarjetas"
                        color={themeColors.card}
                        onChange={(color) => handleColorChange('card', color)}
                    />
                     <ColorPicker 
                        label="Color Primario (Botones, Acentos)"
                        color={themeColors.primary}
                        onChange={(color) => handleColorChange('primary', color)}
                    />
                </CardContent>
                <CardFooter>
                    <Button onClick={handleSaveChanges} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Guardar Cambios
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
