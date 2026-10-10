'use client';
export async function tursoRequest(method:'GET'|'POST'|'DELETE',collection:string,body?:any) {
 const condoId=typeof window!=='undefined'?(localStorage.getItem('activeCondoId')||localStorage.getItem('workingCondoId')||undefined):undefined;
 const params=new URLSearchParams({collection}); if(condoId) params.set('condoId',condoId); if(method==='GET'&&body?.id) params.set('id',body.id);
 const response=await fetch('/api/data/documents?'+params.toString(),{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body||{})}),cache:'no-store'});
 const result=await response.json().catch(()=>({})); if(!response.ok) throw new Error(result.error||'No se pudo acceder a los datos de Turso.'); return result;
}
