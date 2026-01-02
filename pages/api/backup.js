// pages/api/backup.js
export default async function handler(req, res) {
    res.status(200).json({
      ok: true,
      message: "Endpoint de backup activo",
      timestamp: new Date().toISOString()
    });
  }
  