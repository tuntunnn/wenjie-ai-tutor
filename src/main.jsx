import React,{useEffect,useState,useRef} from 'react';
import {AccountDialog} from './AccountDialog.jsx';
import {Button,TextArea} from '@heroui/react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {lessons,lookup,matches} from './tutor.mjs';

async function api(path,data){
 const r=await fetch('/api/'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});
 const v=await r.json();if(!r.ok)throw Error(v.error||'请求失败，请重试。');return v;
}
const variant={steps:[['独立算一算，x 等于几？','7','试着回忆上一题的两个运算。','先抵消常数，再让系数化一。']]};
function App(){
 const [screen,go]=useState('home'),[problem,setProblem]=useState(''),[pic,setPic]=useState(''),[item,setItem]=useState(null),[step,S]=useState(0),[level,L]=useState(0),[hist,H]=useState([]),[answer,A]=useState(''),[error,E]=useState(''),[busy,B]=useState(false),[done,D]=useState(false),[online,O]=useState(false),[server,V]=useState(false);
 const [user,setUser]=useState(null),[accounts,setAccounts]=useState(false),[panel,setPanel]=useState('');
 const conversation=useRef(null);
 const sendTurn=(path,data)=>api(path,{...data,accountId:user?.id??null});
 function changeAccount(next){
  if(screen==='practice')reset();
  setUser(next);
 }
 function openHistory(id,turns){
  const first=turns[0],last=turns[turns.length-1];
  const messages=[];
  for(const row of turns){
   if(row.turn_number>0)messages.push({role:'学生',text:row.student_text});
   messages.push({role:'导师',text:row.tutor_text});
  }
  const local=first.mode==='local'?(first.tutor_text==='独立算一算，x 等于几？'?variant:lookup(first.problem)):null;
  let index=0,hints=0;
  if(local)for(const row of turns.slice(1)){
   if(matches(row.student_text,local.steps[index][1])){index=Math.min(index+1,local.steps.length-1);hints=0;}
   else hints=Math.min(hints+1,2);
  }
  conversation.current=id;
  setProblem(first.problem);setPic('');setItem(local);S(index);L(hints);H(messages);
  D(!!last.completed);A('');E('');setFailedReply(null);go('practice');
  requestAnimationFrame(focusDraft);
 }
 const [failedReply,setFailedReply]=useState(null);
 const focusDraft=()=>draft.current?.focus({preventScroll:true});
 const input=useRef(), camera=useRef(), end=useRef(), draft=useRef();
 useEffect(()=>{if(location.protocol!=='file:')api('status').then(s=>{V(true);O(s.online);setAccounts(!!s.accounts);setUser(s.user??null)}).catch(()=>{});},[]);
 useEffect(()=>{if(hist.length>1)end.current?.scrollIntoView({block:'nearest'});},[hist]);
 function reset(){setFailedReply(null);conversation.current=null;go('home');setPic('');setProblem('');A('');D(false);H([]);E('');}
 function confirm(p='',img=''){setProblem(p);setPic(img);go('confirm');E('');}
 async function photo(e){
 const file=e.target.files?.[0];e.target.value='';if(!file)return;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>6e6){E('请选择 6 MB 以内的 JPG、PNG 或 WebP 题图。');return;}
 B(true);E('');try{const url=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file)});confirm('',url);
 if(!server){E('离线文件模式：请对照照片输入题面，或启动本机服务自动读图。');return;}
 const r=await api('read',{image:url});setProblem(current=>current||r.text);
 }catch(err){E(err.message||'读图失败，请手动补全题面。');}finally{B(false);}
 }
 const tutor=text=>({role:'导师',text});
 async function start(question=problem,image=pic,newQuestion=false){
 const local=lookup(question), useLocal=!!local&&!online;
 focusDraft();
 if(!local&&!online){E('这道新题需要连接模型。请打开已配置模型的服务再试。');return;}
 if(newQuestion)conversation.current=null;
 conversation.current??=crypto.randomUUID();
 const entering=screen!=='practice'||newQuestion;
 flushSync(()=>{
  B(true);E('');setFailedReply(null);
  if(entering){setProblem(question);setPic(image);setItem(useLocal?local:null);S(0);L(0);D(false);A('');H([]);go('practice');}
 });
 focusDraft();
 try{
  const q=useLocal?local.steps[0][0]:(await sendTurn('turn',{id:conversation.current,problem:question,history:[],image})).message;
  if(useLocal&&server)await sendTurn('record',{id:conversation.current,turn:0,problem:question,student:'',tutor:q,done:false});
  H([tutor(q)]);
 }catch(err){E(err.message)}finally{B(false);}
 }
 async function submit(hint=false,retry=null){
 const reply=retry??(hint?'我还没想出来，给我一点提示。':answer.trim());if(!reply||busy)return;
 const next=[...hist,{role:'学生',text:reply}];
 focusDraft();E('');setFailedReply(null);B(true);H(next);
 if(!hint&&retry===null)A('');
 function failed(err){H(hist);setFailedReply({hint,reply});E(err.message);}
 if(!item){try{const r=await sendTurn('turn',{id:conversation.current,problem,history:next,image:pic});H([...next,tutor(r.message)]);D(r.done);}catch(err){failed(err);}finally{B(false);}return;}
 const [q,accepted,h1,h2]=item.steps[step];
 const correct=!hint&&matches(reply,accepted);
 const last=correct&&step+1===item.steps.length;
 const specific=item===lessons[6]&&step===0&&matches(reply,'5')?'再加 5 会让常数变大。':'';
 const message=correct?(last?'你算出来了！回看每一步，最后的结果是你自己写出的 '+reply+'。':'这一步成立。'+item.steps[step+1][0]):
  (hint?'':specific||'我们再核对一下这一步。')+(level===0?h1:h2)+(level>=1?' '+q:'');
 B(true);
 try{
  if(server)await sendTurn('record',{id:conversation.current,turn:next.filter(m=>m.role==='学生').length,problem,student:reply,tutor:message,done:last});
  H([...next,tutor(message)]);D(last);if(correct&&!last)S(step+1);L(correct?0:Math.min(level+1,2));
 }catch(err){failed(err)}finally{B(false);}
 }
 const chat=screen==='practice';
 const value=chat?answer:problem;
 const change=chat?A:setProblem;
 function send(){
  if(busy||!value.trim())return;
  
  if(chat&&done&&item)start(answer.trim(),'',true);
  else if(chat&&hist.length)submit();
  else if(!chat)start();
 }
 const errorView=error&&<div className="error" role="alert">{error}
  {chat&&!hist.length&&<Button type="button" isDisabled={busy} onPress={()=>start()}>重试首问</Button>}
  {failedReply&&<Button type="button" isDisabled={busy} onPress={()=>submit(failedReply.hint,failedReply.reply)}>重新发送上一条</Button>}
 </div>;
 const composer=<form className="composer" onSubmit={e=>{e.preventDefault();send()}}>
  {pic&&!chat&&<div className="attachment"><img src={pic} alt="待核对的题图"/><Button type="button" isDisabled={busy} onPress={()=>{reset();draft.current?.focus()}}>移除图片</Button></div>}
  <TextArea ref={draft} aria-label={chat?'我的回复':'题目'} rows={chat?2:3} value={value}
   maxLength={chat?1600:5000} placeholder={chat?(done&&item?'输入下一道题…':'写下你的想法…'):pic?'核对或补充题面…':'输入题目或学习中遇到的问题…'}
   onChange={e=>change(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();send()}}}/>
  <div className="actions">
   {chat?<Button type="button" className="subtle" isDisabled={busy||done||!hist.length} onPress={()=>submit(true)}>给我一点提示</Button>:
    <div className="photo-action">
     <Button type="button" className="photo" isDisabled={busy} onPress={()=>camera.current.click()}><Icon name="camera"/>拍照搜题</Button>
     <Button type="button" variant="ghost" className="upload" isDisabled={busy} onPress={()=>input.current.click()}><Icon name="image"/>上传图片</Button>
    </div>}
   <Button type="submit" isIconOnly variant="primary" className="send" aria-label="发送" isDisabled={busy||!value.trim()||(chat&&!hist.length)}><Icon name="send"/></Button>
  </div>
 </form>;
 return <div className="app"><header><span className="brand"><span aria-hidden="true" className="brand-mark"><i/><i/></span>问阶</span><nav aria-label="对话工具">{accounts&&<><Button className="new" isDisabled={busy} onPress={()=>setPanel('history')}>学习记录</Button>{!user&&<Button className="new login-trigger" isDisabled={busy} onPress={()=>setPanel('login')}>登录</Button>}</>}{(chat||pic)&&<Button className="new" isDisabled={busy} onPress={reset}><Icon name="new"/>新对话</Button>}</nav></header>
 {panel&&<AccountDialog user={user} historyIntent={panel==='history'} api={api} onUser={changeAccount} onOpen={openHistory} onClose={()=>setPanel('')}/>}
 {chat?<main className="room"><section className="messages" aria-label="解题对话" aria-live="polite">
 <div className="user">{pic&&<img src={pic} alt="原题照片"/>}{problem}</div>
 {hist.map((m,i)=><div key={i} className={m.role==='学生'?'user':'assistant'} aria-label={m.role}>{m.text}</div>)}
 {busy&&<p role="status" className="pending">思考中…</p>}<div ref={end}/></section>
 <div className="dock">{errorView}{done&&<div className="finished"><Button className="photo" isDisabled={busy} onPress={reset}>开始新对话</Button>{item===lessons[6]&&<Button className="subtle" isDisabled={busy} onPress={async()=>{const id=crypto.randomUUID();B(true);try{if(server)await sendTurn('record',{id,turn:0,problem:'解方程：3x + 5 = 26。',student:'',tutor:'独立算一算，x 等于几？',done:false});}catch(err){E(err.message);return;}finally{B(false);}conversation.current=id;setProblem('解方程：3x + 5 = 26。');setPic('');setItem(variant);S(0);L(0);H([tutor('独立算一算，x 等于几？')]);D(false);focusDraft()}}>做一道变式</Button>}</div>}{composer}</div>
 </main>:<main className="welcome"><div className="center"><h1>{pic?'核对一下题目':<>今天想<span>弄懂什么？</span></>}</h1>{composer}{busy&&<p className="pending" role="status">{!problem&&pic?'正在识别题面…':'正在处理…'}</p>}{errorView}</div></main>}
 <input hidden ref={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={photo}/>
 <input hidden ref={camera} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={photo}/>
 </div>;
}
function Icon({name}){
 const paths={image:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.4"/><path d="m4 17 5-5 3 3 4-5 5 6"/></>,camera:<><path d="M3 7.5h4l1.5-2.8h7L17 7.5h4v12H3z"/><circle cx="12" cy="13" r="3.4"/></>,send:<><path d="M12 19V5m-6 6 6-6 6 6"/></>,new:<><path d="M11 5H5v14h14v-6M12 13l1-.2 7-7-2.5-2.5-7 7L10 14z"/></>};
 return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
createRoot(document.getElementById('root')).render(<App/>);
