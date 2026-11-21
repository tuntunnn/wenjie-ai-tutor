import {createHash,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {pool} from './database.mjs';

const derive=promisify(scrypt);
const sessionName='wenjie_session';
const sessionSeconds=7*24*60*60;
const digest=value=>createHash('sha256').update(value).digest();
const cookie=value=>sessionName+'='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+(value?sessionSeconds:0);
const throttle=new Map();

function sessionToken(req){
 return (req.headers.cookie||'').split(/;\s*/).find(value=>value.startsWith(sessionName+'='))?.slice(sessionName.length+1);
}
export async function currentUser(req){
 const token=sessionToken(req);
 if(!pool||!token||!/^[a-f0-9]{64}$/.test(token))return null;
 const [[user]]=await pool.execute(`SELECT a.id,a.username FROM account_sessions s JOIN accounts a ON a.id=s.account_id
 WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP()`,[digest(token)]);
 return user??null;
}
export async function logout(req,res){
 const token=sessionToken(req);
 if(pool && token)await pool.execute('DELETE FROM account_sessions WHERE token_hash=?',[digest(token)]);
 res.setHeader('Set-Cookie',cookie(''));
}
export async function authenticate(action,body,req,res){
 const username=typeof body.username==='string'?body.username.trim().normalize('NFKC').toLowerCase():'';
 const password=body.password;
 if(!/^[\p{L}\p{N}_-]{2,32}$/u.test(username)||typeof password!=='string'||password.length<8||password.length>128)
  throw Error('用户名需为 2–32 个字母、汉字、数字、下划线或短横线，密码为 8–128 个字符。');
 const host=req.socket.remoteAddress, now=Date.now();
 const attempts=(throttle.get(host)||[]).filter(t=>now-t<60000);
 if(attempts.length>=16)throw Error('尝试次数过多，请稍后再试。');
 throttle.set(host,[...attempts,now]);
 const [[existing]]=await pool.execute('SELECT id,salt,password_hash FROM accounts WHERE username=?',[username]);
 const salt=action==='login'&&existing?existing.salt:randomBytes(16);
 const hash=await derive(password,salt,64);
 if(action==='login' && (!existing||!timingSafeEqual(hash,existing.password_hash)))throw Error('用户名或密码错误。');
 const db=await pool.getConnection();
 try{
  await db.beginTransaction();
  let id=existing?.id;
  if(action==='register'){
   const [row]=await db.execute('INSERT INTO accounts(username,salt,password_hash) VALUES (?,?,?)',[username,salt,hash]);
   id=row.insertId;
  }
  const token=randomBytes(32).toString('hex');
  await db.execute('DELETE FROM account_sessions WHERE expires_at<=UTC_TIMESTAMP()');
  await db.execute('INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY))',[digest(token),id]);
  await db.commit();
  res.setHeader('Set-Cookie',cookie(token));
  return {id,username};
 }catch(err){
  await db.rollback();
  if(err.code==='ER_DUP_ENTRY')throw Error('这个用户名已被使用。');
  throw err;
 }finally{db.release();}
}
