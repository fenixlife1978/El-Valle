const fs = require("fs");
const path = require("path");

// Regex para detectar colores
const regex = {
  hex: /#[0-9a-fA-F]{3,6}\b/g,
  rgb: /rgb[a]?\([0-9 ,.%]+\)/g,
  hsl: /hsl[a]?\([0-9 ,.%]+\)/g,
  tailwind: /\b(bg|text|border|from|to|via)-[a-z]+-[0-9]{2,3}\b/g,
};

// Extensiones a escanear
const validExtensions = [".js", ".jsx", ".ts", ".tsx", ".css", ".scss", ".html", ".json"];

// Recorrer carpetas recursivamente
function scanDir(dir, results = []) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scanDir(fullPath, results);
    } else {
      if (validExtensions.includes(path.extname(fullPath))) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

// Extraer colores de un archivo
function extractColors(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  let found = [];

  for (const key in regex) {
    const matches = content.match(regex[key]);
    if (matches) found.push(...matches);
  }

  return found;
}

// Ejecutar escaneo
function run() {
  console.log("🔍 Escaneando proyecto en busca de colores...\n");

  const files = scanDir(process.cwd());
  let allColors = [];

  files.forEach((file) => {
    const colors = extractColors(file);
    if (colors.length > 0) {
      console.log(`📄 ${file}`);
      colors.forEach((c) => console.log("   →", c));
      allColors.push(...colors);
    }
  });

  // Eliminar duplicados
  const uniqueColors = [...new Set(allColors)];

  // Guardar en JSON
  fs.writeFileSync("colors-found.json", JSON.stringify(uniqueColors, null, 2));

  console.log("\n✅ Escaneo completado.");
  console.log("✅ Colores únicos guardados en colors-found.json");
  console.log(`✅ Total colores únicos encontrados: ${uniqueColors.length}`);
}

run();

