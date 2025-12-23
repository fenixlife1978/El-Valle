import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import fetch from "node-fetch";
import PDFDocument from "pdfkit";

admin.initializeApp();
const firestore = admin.firestore();

// Utilidad para obtener la fecha en formato YYYY-MM-DD (hora Caracas)
function getTodayDateString(): string {
  const now = new Date();
  const offsetMs = -4 * 60 * 60 * 1000; // UTC-4 para Caracas
  const local = new Date(now.getTime() + offsetMs);
  return local.toISOString().split("T")[0];
}

// Función principal para obtener y guardar la tasa BCV
async function fetchAndStoreBCVRate(): Promise<void> {
  const today = getTodayDateString();

  // Verifica si ya existe la tasa para hoy
  const historyRef = firestore.doc(`rates_history/${today}`);
  const historySnap = await historyRef.get();
  if (historySnap.exists) {
    console.log(`Ya existe tasa para ${today}, no se actualiza.`);
    return;
  }

  // Obtener la tasa desde el sitio oficial del BCV
  const response = await fetch("https://www.bcv.org.ve/");
  const html = await response.text();

  const match = html.match(/<strong>(\d{1,3}(?:\.\d{3})*,\d{2})<\/strong>/);
  if (!match) {
    throw new Error("No se pudo extraer la tasa BCV del HTML.");
  }

  const rawRate = match[1]; // Ej: "36.542,12"
  const normalizedRate = parseFloat(rawRate.replace(/\./g, "").replace(",", "."));

  // Guardar en Firestore
  await firestore.doc("rates/bcv").set({
    value: normalizedRate,
    source: "https://www.bcv.org.ve/",
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
    date: today
  });

  await historyRef.set({
    value: normalizedRate,
    source: "https://www.bcv.org.ve/",
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log(`Tasa BCV ${normalizedRate} guardada para ${today}`);
}

// Función programada: todos los días a las 00:01 AM hora Caracas (04:01 UTC)
export const bcvDailyJob = functions.pubsub
  .schedule("1 4 * * *") // 04:01 UTC = 00:01 Caracas
  .timeZone("America/Caracas")
  .onRun(async () => {
    await fetchAndStoreBCVRate();
  });

// Endpoint HTTP para probar manualmente
export const bcvManualTrigger = functions.https.onRequest(async (req, res) => {
  try {
    await fetchAndStoreBCVRate();
    res.status(200).send("Tasa BCV actualizada manualmente.");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al actualizar la tasa BCV.");
  }
});

// NUEVO: Endpoint HTTP para generar y descargar un recibo PDF
export const generarReciboPDF = functions.https.onRequest(async (req, res) => {
  try {
    const doc = new PDFDocument();
    let buffers: Buffer[] = [];

    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(buffers);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=recibo.pdf");
      res.send(pdfBuffer);
    });

    // Contenido del recibo (ejemplo)
    doc.fontSize(18).text("Recibo ValleCondo", { align: "center" });
    doc.moveDown();
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-VE")}`);
    doc.text("Monto: 100 USD");
    doc.text("Fuente: ValleCondo App");
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generando el PDF.");
  }
});
