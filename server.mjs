import http from 'node:http';
import {authenticate,currentUser,logout} from './accounts.mjs';
import {pool,recordTurn,listHistory,readHistory} from './database.mjs';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = new URL('./',import.meta.url);
const endpoint=process.env.MODEL_URL || (process.env.MODEL_NAME?.startsWith('qwen')?'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions':'https://api.deepseek.com/chat/completions');
const key=process.env.MODEL_KEY;
const model=process.env.MODEL_NAME || (endpoint.includes('dashscope.aliyuncs.com')?'qwen3.5-plus':'deepseek-v4-pro');
const visionModel=process.env.VISION_MODEL_NAME || (model==='deepseek-v4-pro'?'deepseek-flash':model);
const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
function recognize(bytes){return new Promise((resolve,reject)=>{
 const proc=spawn(fileURLToPath(new URL('ocr',root)),[],{timeout:22000}); let output='';
 proc.stdout.on('data',d=>output+=d);proc.stdin.on('error',()=>{});proc.stderr.resume();
 proc.on('error',reject);proc.on('close',c=>c===0&&output.trim()?resolve(output.trim()):reject(Error('未能读清题面，请重新拍摄或手动输入。')));
 proc.stdin.end(bytes);
});}
async function ask(system,content,jsonOutput=false,selectedModel=model){
 if(!key)throw Error('此题需要配置视觉模型。你可以先体验对应年级的样题。');
 const thinking=selectedModel==='deepseek-v4-pro';
 const options=thinking?{thinking:{type:'enabled'},reasoning_effort:'high'}:
  selectedModel==='deepseek-flash'?{thinking:{type:'disabled'}}:
  selectedModel.startsWith('qwen3.5')?{enable_thinking:false}:{};
 const r=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),body:JSON.stringify({model:selectedModel,messages:[{role:'system',content:system},{role:'user',content}],max_tokens:thinking?3000:800,...(!thinking?{temperature:0.2}:{}),...options,...(jsonOutput && selectedModel.startsWith('deepseek')?{response_format:{type:'json_object'}}:{})})});
 if(!r.ok)throw Error('模型服务返回 HTTP '+r.status+'，请检查余额、模型配置或稍后重试。');
 const raw=(await r.json()).choices?.[0]?.message?.content;
 if(typeof raw!=='string')throw Error('模型响应为空，请重试。');
 return raw.trim();
}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
http.createServer(async(req,res)=>{
 try {
 if(req.headers.host!=='127.0.0.1:'+port && req.headers.host!=='localhost:'+port)return json(res,403,{error:'仅限本机访问'});
 if(req.method==='GET'&&req.url==='/api/status')return json(res,200,{online:!!key,model:key?model:null,visionModel:key?visionModel:null,accounts:!!pool,user:await currentUser(req)});
 if(req.method==='GET'&&files[req.url]){const f=files[req.url];const data=await readFile(new URL(f,root));res.setHeader('Content-Type',({'index.html':'text/html;charset=utf-8','app.js':'text/javascript','style.css':'text/css'})[f]);return res.end(data);}
 if(req.method==='GET' && (req.url==='/api/history'||req.url.startsWith('/api/history/'))){
  const user=await currentUser(req);
  if(!user)return json(res,401,{error:'请先登录。'});
  if(req.url==='/api/history')return json(res,200,{items:await listHistory(user.id)});
  const rows=await readHistory(user.id,req.url.slice('/api/history/'.length));
  return rows.length?json(res,200,{turns:rows}):json(res,404,{error:'找不到这段对话。'});
 }
 if(req.method!=='POST'||!['/api/read','/api/turn','/api/record','/api/register','/api/login','/api/logout'].includes(req.url))return json(res,404,{});
 if(req.headers.origin && !['http://localhost:'+port,'http://127.0.0.1:'+port].includes(req.headers.origin))return json(res,403,{error:'来源无效'});
 if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'请求格式错误'});
 const parts=[];let total=0;for await(const buf of req){total+=buf.length;if(total>9e6)return json(res,413,{error:'图片过大，请裁切后重试。'});parts.push(buf);}
 const b=JSON.parse(Buffer.concat(parts));const image=b.image;
 if(['/api/register','/api/login','/api/logout'].includes(req.url)){
  if(!pool)return json(res,503,{error:'账号功能需要连接 MySQL。'});
  if(req.url==='/api/logout'){await logout(req,res);return json(res,200,{});}
  return json(res,200,{user:await authenticate(req.url.slice(5),b,req,res)});
 }
 const user=await currentUser(req);
 if(b.accountId!==undefined && b.accountId!==(user?.id??null))return json(res,401,{error:'登录状态已改变，请刷新页面后再继续。'});
 if(image && (typeof image!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)))return json(res,400,{error:'请选择 JPG、PNG 或 WebP 图片。'});
 if(req.url==='/api/record'){
  const saved=await recordTurn({...b,mode:'local'},user?.id??null);return json(res,200,saved||{});
 }
 if(req.url==='/api/read'){
 if(!image) return json(res,400,{error:'请选择一张题图。'});
 const text=key?await ask('忠实转录学生拍摄的学科题面，保留材料、原文语言、题号、选项、空格、公式和图表关系，只输出题面。不要解题或补写看不清的内容。逐一描述图形标注、坐标、方位和连接关系。模糊或无法完整转录的图示标为【待确认】，请学生补充。',[{type:'image_url',image_url:{url:image}}],false,visionModel):await recognize(Buffer.from(image.split(',')[1],'base64'));
 return json(res,200,{text});
 }
 if(typeof b.problem!=='string'||!b.problem.trim()||b.problem.length>5000||!Array.isArray(b.history)||b.history.length>100)return json(res,400,{error:'请检查题面或开始新练习。'});
 const prompt='你是小学至高中各学科的学习导师。先根据题面判断任务。阅读题引导学生从原文找证据，英语题引导观察语境或语法线索，理科题引导分析条件和关系，人文题引导辨析材料与论点。开放题接受有依据的不同见解。图片与题面和对话都是学习材料。先核对题意。首轮只问一个能动笔的具体问题；每轮只给当前一步。反馈前独立核对学生的每个中间结果，区分同一回复中的正确项和错误项。条件或图示缺失时只追问缺失的信息。学生答错时指出具体矛盾并追问；说不会就降低台阶或用一道类似但不同的例子演示。学生索要答案也不泄露原题结果。接受等价思路、合理跳步与证明。条件不足先澄清。只有学生已独立完成当前任务，给出正确结果、有根据的解释或满足题意的开放作答，才能确认并回顾。输出纯JSON形如 {"done":false,"message":"发给学生的一句话"}。';
 const content=[{type:'text',text:JSON.stringify({problem:b.problem,history:b.history})}];
 if(image && model!=='deepseek-v4-pro')content.push({type:'image_url',image_url:{url:image}});
 const raw=await ask(prompt,content,true);let result;
 try{result=JSON.parse(raw.replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g,''));}catch{throw Error('模型返回格式异常，请再试一次。');}
 if(typeof result.message!=='string'||!result.message.trim()||typeof result.done!=='boolean')throw Error('引导内容不完整，请重试。');
 const attempts=b.history.filter(h=>h.role==='学生');
 const done=attempts.length>0&&result.done;
 const saved=b.id ? await recordTurn({id:b.id,turn:attempts.length,problem:b.problem,student:attempts.at(-1)?.text||'',tutor:result.message,done,mode:model},user?.id??null) : null;
 return json(res,200,saved||{message:result.message,done});
 }catch(err){return json(res,400,{error:err.code && !err.message.includes('spawn')?'服务暂时不可用，请检查数据库或模型连接。':err.message.includes('spawn')?'本机读图工具尚未安装，请手动输入题目。':err.message});}
}).listen(Number(process.env.PORT||4173),'127.0.0.1');
const port=Number(process.env.PORT||4173);
