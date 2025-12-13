
'use server';

import * as ExcelJS from 'exceljs';

/**
 * Ejemplo completo de creación y lectura de un archivo Excel usando exceljs.
 * Este script demuestra cómo:
 * 1. Crear un libro y una hoja de cálculo.
 * 2. Agregar encabezados y filas con diferentes tipos de datos.
 * 3. Escribir el archivo en un buffer en memoria (simulando el guardado).
 * 4. Leer el archivo desde ese buffer.
 * 5. Iterar sobre las filas y mostrar su contenido en la consola.
 */
async function excelExample() {
  // --- 1. CREACIÓN Y ESCRITURA DEL ARCHIVO EXCEL ---

  // Crear un nuevo libro de trabajo
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MiApp';
  workbook.lastModifiedBy = 'MiApp';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Agregar una hoja de cálculo llamada "Pagos"
  const worksheet = workbook.addWorksheet('Pagos');

  // 2. Agregar encabezados
  worksheet.columns = [
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Monto', key: 'monto', width: 15, style: { numFmt: '"$"#,##0.00' } },
    { header: 'Fecha', key: 'fecha', width: 20, style: { numFmt: 'dd/mm/yyyy' } },
  ];

  // 3. Insertar filas de datos
  const data = [
    { nombre: 'Edwin', monto: 100, fecha: new Date() },
    { nombre: 'Maria', monto: 150.75, fecha: new Date('2023-10-15') },
    { nombre: 'Carlos', monto: 75.50, fecha: new Date('2023-11-01') },
  ];

  data.forEach(row => {
    worksheet.addRow(row);
  });
  
  console.log('Archivo Excel creado en memoria con éxito.');

  // 4. Guardar el archivo en un buffer
  // En un entorno de servidor, usualmente no se guarda en un archivo físico
  // sino que se envía como respuesta o se almacena en un buffer.
  const buffer = await workbook.xlsx.writeBuffer();
  console.log('Archivo guardado en buffer. Listo para ser leído.');
  
  // --- 5. LECTURA DEL ARCHIVO EXCEL ---

  // Crear un nuevo libro de trabajo para la lectura
  const readWorkbook = new ExcelJS.Workbook();

  // Cargar los datos desde el buffer
  await readWorkbook.xlsx.load(buffer);

  const readWorksheet = readWorkbook.getWorksheet('Pagos');
  if (readWorksheet) {
    console.log('\n--- Contenido del archivo leído ---');
    // Iterar sobre cada fila que tiene contenido
    readWorksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      // El row.values es un array, donde el índice 0 es nulo y los valores comienzan en 1.
      console.log(`Fila ${rowNumber}:`, {
        Nombre: row.getCell('A').value,
        Monto: row.getCell('B').value,
        Fecha: row.getCell('C').value,
      });
    });
    console.log('--- Fin del contenido ---');
  } else {
    console.log('No se encontró la hoja "Pagos" en el archivo leído.');
  }
}

// Ejecutar el ejemplo
excelExample().catch(err => {
  console.error('Ocurrió un error en el ejemplo de Excel:', err);
});
