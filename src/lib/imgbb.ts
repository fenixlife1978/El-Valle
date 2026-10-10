import { getStorage, ref, uploadBytes, getDownloadURL } from '@/lib/turso/storage-compat';
import { compressImageAsBlob } from '@/lib/utils';

// Nombre histórico conservado para no romper pantallas; los archivos ahora se guardan en la base Turso del condominio.
export async function uploadToImgbb(file: File, shared = false): Promise<string | null> {
  try {
    if (!file || !file.type.startsWith('image/')) throw new Error('Selecciona un archivo de imagen.');
    let width=1600, height=1600;
    let compressed:Blob=file;
    for(let attempt=0;attempt<7;attempt++){
      compressed=await compressImageAsBlob(file,width,height);
      if(compressed.size<=280000)break;
      width=Math.max(320,Math.floor(width*0.78));
      height=Math.max(320,Math.floor(height*0.78));
    }
    if(compressed.size>280000)throw new Error('La imagen supera el límite de almacenamiento después de comprimirla.');
    const key=typeof crypto!=='undefined'&&'randomUUID'in crypto?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    const safeName=(file.name||'imagen.jpg').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-70);
    const path=(shared?'public/media/':'receipts/')+key+'-'+safeName;
    const storageRef=ref(getStorage(),path);
    const uploaded=await uploadBytes(storageRef,compressed,{contentType:'image/jpeg'});
    return await getDownloadURL(uploaded.ref);
  } catch(error) {
    console.error('Error guardando imagen en Turso:',error);
    return null;
  }
}

export async function uploadMultipleToImgbb(files: File[]): Promise<string[]> {
  const urls:string[]=[];
  for(const file of files){const url=await uploadToImgbb(file);if(url)urls.push(url);}
  return urls;
}
