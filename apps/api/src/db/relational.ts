import { rows,one,insert,identifier } from './adapter';
export async function updateRow(table:string,id:string,data:any,allowed:string[]) {
  const keys=allowed.filter(k=>k!=='id'&&data[k]!==undefined);
  if(!keys.length)return one(`SELECT * FROM ${identifier(table)} WHERE id=$1`,[id]);
  return one(`UPDATE ${identifier(table)} SET ${keys.map((k,i)=>identifier(k)+'=$'+(i+2)).join(',')},updated_at=now() WHERE id=$1 RETURNING *`,[id,...keys.map(k=>data[k])]);
}
export async function deleteRow(table:string,id:string){return !!await one(`DELETE FROM ${identifier(table)} WHERE id=$1 RETURNING id`,[id]);}
