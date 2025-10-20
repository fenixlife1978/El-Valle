
'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const colorPalette = [
  '#000000', '#FFFFFF', '#6B7280', '#4B5563', '#111827',
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
  '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
  '#EC4899', '#F43F5E'
];

type ColorPickerProps = {
    label: string;
    color: string;
    onChange: (color: string) => void;
};

export function ColorPicker({ label, color, onChange }: ColorPickerProps) {
    const [hexColor, setHexColor] = useState(color);

    const handleColorChange = (newColor: string) => {
        setHexColor(newColor);
        onChange(newColor);
    }
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value;
        if (!value.startsWith('#')) {
            value = `#${value}`;
        }
        setHexColor(value);
        if (/^#[0-9A-F]{6}$/i.test(value)) {
            onChange(value);
        }
    }

    return (
        <div className="space-y-3">
            <Label className="text-lg font-semibold">{label}</Label>
            <div className="flex items-center gap-4">
                <div 
                    className="h-12 w-12 rounded-md border-2 border-border" 
                    style={{ backgroundColor: color }}
                />
                <Input 
                    value={hexColor}
                    onChange={handleInputChange}
                    className="h-12 text-lg font-mono w-48"
                />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
                {colorPalette.map((swatch) => (
                    <button
                        key={swatch}
                        type="button"
                        onClick={() => handleColorChange(swatch)}
                        className={cn(
                            "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
                            color.toLowerCase() === swatch.toLowerCase() ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background' : 'border-transparent'
                        )}
                        style={{ backgroundColor: swatch }}
                        aria-label={`Select color ${swatch}`}
                    />
                ))}
            </div>
        </div>
    );
}
