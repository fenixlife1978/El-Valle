import JsBarcode from 'jsbarcode';
import { createCanvas } from 'canvas';

export const generateBarcodeDataURL = (text: string): string => {
  try {
    const canvas = createCanvas(200, 50);
    JsBarcode(canvas, text, {
      format: "CODE128",
      width: 1,
      height: 30,
      displayValue: false
    });
    return canvas.toDataURL();
  } catch (error) {
    console.error("Error generando código de barras:", error);
    return "";
  }
};
