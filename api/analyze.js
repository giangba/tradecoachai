// Xác thực user (Supabase) -> thử lần lượt các model AI (mặc định: gemini -> claude -> fallback OpenAI-compatible)
const DEF=["gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash-lite"];
const sp=v=>(v||"").split(",").map(x=>x.trim()).filter(Boolean);
const MODELS=[...new Set(sp(process.env.GEMINI_MODELS).length?sp(process.env.GEMINI_MODELS):[...sp(process.env.GEMINI_MODEL),...DEF])];
const CL_KEY=process.env.ANTHROPIC_API_KEY,CL_MODEL=process.env.ANTHROPIC_MODEL||"claude-sonnet-5-5";
const FB_MODEL=process.env.FALLBACK_MODEL||"openai/gpt-4o",FB_KEY=process.env.FALLBACK_API_KEY||process.env.GITHUB_TOKEN;
const FB_BASE=(process.env.FALLBACK_BASE_URL||"https://models.github.ai/inference").replace(/\/$/,"");
async function geminiOne(model,prompt,images,json,ms){
 const parts=images.map(i=>({inline_data:{mime_type:i.media_type||"image/jpeg",data:i.data}}));
 const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:"POST",
  headers:{"content-type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},signal:AbortSignal.timeout(ms),
  body:JSON.stringify({contents:[{role:"user",parts:[...parts,{text:prompt}]}],generationConfig:json?{temperature:0.2,responseMimeType:"application/json"}:{temperature:0.4}})});
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(j.error?.message||"HTTP "+r.status);
 const text=(j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("");
 if(!text)throw new Error("không trả kết quả"+(j.promptFeedback?.blockReason?" ("+j.promptFeedback.blockReason+")":""));return text}
async function gemini(prompt,images,json){const t0=Date.now(),errs=[];
 for(let i=0;i<MODELS.length;i++){const left=35000-(Date.now()-t0);if(left<3000)break;
  try{return{text:await geminiOne(MODELS[i],prompt,images,json,Math.min(15000,left)),label:i===0?"gemini":MODELS[i]}}
  catch(e){errs.push(MODELS[i]+": "+(e.name==="TimeoutError"?"quá chậm":e.message.slice(0,80)))}}
 throw new Error(errs.join("; "))}
async function claude(prompt,images){
 const parts=images.map(i=>({type:"image",source:{type:"base64",media_type:i.media_type||"image/jpeg",data:i.data}}));
 const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",signal:AbortSignal.timeout(30000),
  headers:{"content-type":"application/json","x-api-key":CL_KEY,"anthropic-version":"2023-06-01"},
  body:JSON.stringify({model:CL_MODEL,max_tokens:1500,messages:[{role:"user",content:[...parts,{type:"text",text:prompt}]}]})});
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error?.message||"HTTP "+r.status);
 const text=(j.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("");if(!text)throw new Error("không trả kết quả");return text}
async function fallback(prompt,images,json){
 const parts=images.map(i=>({type:"image_url",image_url:{url:`data:${i.media_type||"image/jpeg"};base64,${i.data}`}}));
 const body={model:FB_MODEL,temperature:0.2,max_tokens:1500,messages:[{role:"user",content:[...parts,{type:"text",text:prompt}]}]};
 if(json)body.response_format={type:"json_object"};
 const r=await fetch(FB_BASE+"/chat/completions",{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+FB_KEY},signal:AbortSignal.timeout(30000),body:JSON.stringify(body)});
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error?.message||j.message||"HTTP "+r.status);
 const text=j.choices?.[0]?.message?.content;if(!text)throw new Error("không trả kết quả: "+JSON.stringify(j).slice(0,200));return text}
const PROV={gemini:{ok:()=>!!process.env.GEMINI_API_KEY,run:gemini},
 claude:{ok:()=>!!CL_KEY,run:async(p,i)=>({text:await claude(p,i),label:CL_MODEL})},
 fallback:{ok:()=>!!FB_KEY,run:async(p,i,j)=>({text:await fallback(p,i,j),label:FB_MODEL})}};
async function ask(prompt,images,json){
 const order=(process.env.AI_ORDER||"gemini,claude,fallback").split(",").map(x=>x.trim()).filter(x=>PROV[x]&&PROV[x].ok());
 if(!order.length)throw new Error("Chưa cấu hình khóa AI nào");const errs=[];
 for(const k of order){try{const o=await PROV[k].run(prompt,images,json);
   if(json){const m=o.text.match(/\{[\s\S]*\}/);if(!m)throw new Error("không trả JSON hợp lệ");JSON.parse(m[0])}
   return{text:o.text,provider:o.label}}
  catch(e){console.error(k+" lỗi:",e.message);errs.push(k+" ("+e.message+")")}}
 throw new Error(errs.join(" | "))}
module.exports=async(req,res)=>{
 if(req.method!=="POST")return res.status(405).json({error:"POST only"});
 try{
  const tok=(req.headers.authorization||"").replace("Bearer ","");
  const u=await fetch(process.env.SUPABASE_URL+"/auth/v1/user",{headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:"Bearer "+tok}});
  if(!u.ok)return res.status(401).json({error:"Chưa đăng nhập"});
  const {mode,images=[],rules,trade,setups,stats,trades}=req.body||{};
  const imgs=images.slice(0,2);
  if(mode==="insights"){
   const r=await ask(`Bạn là coach giao dịch Forex giàu kinh nghiệm, nói thẳng nhưng xây dựng. Trả lời tiếng Việt.
Phân tích lịch sử giao dịch của một trader để giúp họ TĂNG WIN-RATE và CẢI THIỆN TỈ LỆ RR.
QUY ƯỚC DỮ LIỆU: R ước tính = thắng +RR dự kiến (từ Entry/SL/TP), thua -1R; app không ghi R thực tế. "ky_vong_R" là kỳ vọng trung bình mỗi lệnh. Nhóm dưới 5 lệnh là mẫu nhỏ, đừng kết luận chắc chắn. Nếu tổng số lệnh đã đóng dưới 30, nói rõ độ tin cậy còn thấp.
THỐNG KÊ (JSON): ${JSON.stringify(stats)}
CÁC LỆNH GẦN NHẤT (JSON): ${JSON.stringify(trades)}
Chỉ dựa trên dữ liệu trên, không bịa số. Tìm: nhóm (cặp tiền/setup/RR/kỷ luật/FOMO/ngày) có kỳ vọng tốt và tệ; lỗi lặp lại trong violations và ghi chú; liên hệ giữa kỷ luật và kết quả; RR dự kiến có hợp lý so với win-rate hoà vốn không. Chỉ trả JSON thuần: {"summary":"2-3 câu","strengths":["..."],"weaknesses":["..."],"actions":["hành động cụ thể, đo lường được, tối đa 5"],"rr_advice":"2-3 câu về RR và điểm hoà vốn"}.`,[],true);
   return res.json({report:JSON.parse(r.text.match(/\{[\s\S]*\}/)[0]),provider:r.provider})}
  if(mode==="rules"){
   const r=await ask(`Bạn là coach giao dịch Forex. Các ảnh là chart mẫu của setup chuẩn (H4 rồi M15 nếu có đủ). Viết bộ quy tắc setup bằng tiếng Việt, dạng gạch đầu dòng rõ ràng, kiểm chứng được: xu hướng H4, vùng/điểm vào, xác nhận M15, vị trí SL/TP, RR tối thiểu, điều kiện KHÔNG được vào lệnh. Chỉ trả về danh sách quy tắc.`,imgs,false);
   return res.json({text:r.text,provider:r.provider})}
  const list=(setups&&setups.length)?setups:(rules?[{name:"Setup",body:rules}]:[]);
  const rulesTxt=list.length?list.map((x,i)=>`### SETUP ${i+1}: ${x.name}\n${x.body}`).join("\n\n"):"(Trader chưa chọn setup – hãy nhắc họ và chấm theo quản trị rủi ro cơ bản)";
  const r=await ask(`Bạn là coach kỷ luật giao dịch Forex, nghiêm khắc nhưng công bằng. Trả lời tiếng Việt.
CÁC SETUP ĐỂ ĐỐI CHIẾU:
${rulesTxt}
LỆNH: ${trade.pair} ${trade.side}, Entry ${trade.entry}, SL ${trade.sl}, TP ${trade.tp}.
GHI CHÚ: ${trade.note||"(trống)"}
ẢNH: ${imgs.length?"chart H4 rồi M15 (theo thứ tự có upload)":"không có"}.
Đối chiếu lệnh với TỪNG setup ở trên, tìm dấu hiệu FOMO/cảm tính/lệch setup. Điểm và verdict tổng lấy theo setup khớp nhất (lệnh chỉ cần tuân thủ đúng một setup là green); violations là các lỗi so với setup khớp nhất. Chỉ trả JSON thuần: {"verdict":"green|yellow|red","score":0-100,"fomo":true|false,"summary":"1-2 câu, nêu setup khớp nhất","violations":["lỗi ngắn gọn"],"per_setup":[{"name":"tên setup đúng như trên","verdict":"green|yellow|red","score":0-100,"summary":"1 câu"}]}. green=tuân thủ đúng setup, red=vi phạm rõ ràng hoặc FOMO.`,imgs,true);
  const ai=JSON.parse(r.text.match(/\{[\s\S]*\}/)[0]);ai.provider=r.provider;return res.json({ai});
 }catch(e){res.status(500).json({error:e.name==="TimeoutError"?"AI phản hồi quá chậm":String(e.message||e)})}};
