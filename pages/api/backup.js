// pages/api/backup.js
import nodemailer from "nodemailer";
import admin from "firebase-admin";

// Inicializar Firebase Admin (usa variables de entorno para credenciales seguras)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

export default async function handler(req, res) {
  try {
    const db = admin.firestore();

    // Función para exportar una colección completa
    async function exportCollection(name) {
      const snapshot = await db.collection(name).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    // Exportar todas las colecciones que pediste
    const backupData = {
      pagos: await exportCollection("pagos"),
      usuarios: await exportCollection("usuarios"),
      propiedades: await exportCollection("propiedades"),
      deudas: await exportCollection("deudas"),
      reportes_guardados: await exportCollection("reportes_guardados"),
      fecha: new Date().toISOString(),
    };

    // Convertir a JSON
    const fileContent = JSON.stringify(backupData, null, 2);

    // Configurar transporte SMTP con Gmail
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // vallecondo@gmail.com
        pass: process.env.EMAIL_PASS, // tu contraseña o contraseña de aplicación
      },
    });

    // Enviar correo con respaldo adjunto
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "Respaldo ValleCondo",
      text: "Adjunto respaldo automático de Firestore.",
      attachments: [
        {
          filename: `backup-${Date.now()}.json`,
          content: fileContent,
        },
      ],
    });

    res.status(200).json({ ok: true, message: "Respaldo enviado por correo" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

  