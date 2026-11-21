import React,{useEffect,useRef,useState} from 'react';

export function AccountDialog({user,historyIntent,api,onUser,onOpen,onClose}){
 const dialog=useRef(null);
 const [register,setRegister]=useState(false);
 const [items,setItems]=useState(null);
 const [attempt,reload]=useState(0);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{dialog.current.showModal();},[]);
 useEffect(()=>{
  if(!user)return;
  let active=true;
  setItems(null);setError('');
  api('history').then(v=>{if(active)setItems(v.items);}).catch(e=>{if(active)setError(e.message);});
  return ()=>{active=false;};
 },[user,attempt,api]);

 async function run(action){
  if(working)return;
  setWorking(true);setError('');
  try{await action();}catch(e){setError(e.message);}finally{setWorking(false);}
 }
 function submit(e){
  e.preventDefault();
  const fields=Object.fromEntries(new FormData(e.currentTarget));
  run(async()=>{
   const {user:next}=await api(register?'register':'login',fields);
   onUser(next);
   if(!historyIntent)onClose();
  });
 }
 return <dialog ref={dialog} className="account-dialog" aria-labelledby="panel-title" onCancel={e=>{if(working)e.preventDefault();}} onClose={onClose}>
  <div className="panel-head"><h2 id="panel-title">{user?'学习记录':register?'创建问阶账号':'登录问阶'}</h2><button type="button" className="close-panel" aria-label="关闭" disabled={working} onClick={onClose}>×</button></div>
  {user?<><div className="panel-account"><span>{user.username}</span><button type="button" className="subtle" disabled={working} onClick={()=>run(async()=>{await api('logout',{});onUser(null);onClose();})}>退出登录</button></div>
   {items===null&&!error&&<p role="status">正在读取学习记录…</p>}
   {items?.length===0&&<p className="panel-empty">还没有学习记录。发来第一道题后，就可以在这里继续上次的对话。</p>}
   <ul className="history-list">{items?.map(row=><li key={row.id}><button type="button" disabled={working} onClick={()=>run(async()=>{
    const {turns}=await api('history/'+row.id);onOpen(row.id,turns);onClose();
   })}><strong>{row.title}</strong><small>{new Date(row.updated).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})} · {row.completed?'已完成':'学习中'}</small></button></li>)}</ul>
   {items===null&&error&&<button type="button" onClick={()=>reload(attempt+1)}>重新读取</button>}
  </>:<form key={register?'register':'login'} onSubmit={submit}>
   <p className="panel-intro">登录后，新提的题会自动保存在学习记录里。</p>
   <label>用户名<input name="username" autoComplete="username" required minLength={2} maxLength={32} placeholder="输入用户名"/></label>
   <label>密码<input type="password" name="password" autoComplete={register?'new-password':'current-password'} required minLength={8} maxLength={128} placeholder={register?'至少 8 个字符':'输入密码'}/></label>
   <button className="panel-submit" disabled={working}>{working?'请稍候…':register?'注册并登录':'登录'}</button>
   <button type="button" className="switch-auth" disabled={working} onClick={()=>{setRegister(!register);setError('');}}>{register?'已有账号，去登录':'没有账号？创建账号'}</button>
  </form>}
  {error&&<p className="error" role="alert">{error}</p>}
 </dialog>;
}
