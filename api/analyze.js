// Vercel Function: xác thực user (Supabase) -> Gemini; nếu Gemini lỗi/quá tải -> model dự phòng (OpenAI-compatible, mặc định GitHub Models)
const MODEL=process.env.GEMINI_MODEL||"gemini-3.8-flash";
const FB_MODEL=process.env.FALLBACK_MODEL||"openai/gpt-4o";
const FB_KEY=process.env.FALLBACK_API_KEY||process.env.GITHUB_TOKEN;
const FB_BASE=(process.env.FALLBACK_BASE_URL||"https://models.github.ai/inference").replace(/\/$/,"");

async function gemini(prompt,images,json){
 const parts=images.map(i=>({inline_data:{mime_type:i.media_type||"image/jpeg",data:i.data}}));
 const gen=json?{temperature:0.2,responseMimeType:"application/json"}:{temperature:0.4};
 const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{method:"POST",
  headers:{"content-type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},signal:AbortSignal.timeout(30000),
  body:JSON.stringify({contents:[{role:"user",parts:[...parts,{text:prompt}]}],generationConfig:gen})});
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(j.error?.message||"HTTP "+r.status);
 const text=(j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("");
 if(!text)throw new Error("không trả kết quả"+(j.promptFeedback?.blockReason?" ("+j.promptFeedback.blockReason+")":""));
 return text}

async function fallback(prompt,images,json){
 const parts=images.map(i=>({type:"image_url",image_url:{url:`data:${i.media_type||"image/jpeg"};base64,${i.data}`}}));
 const body={model:FB_MODEL,temperature:0.2,max_tokens:1500,messages:[{role:"user",content:[...parts,{type:"text",text:prompt}]}]};
 if(json)body.response_format={type:"json_object"};
 const r=await fetch(FB_BASE+"/chat/completions",{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+FB_KEY},
  signal:AbortSignal.timeout(45000),body:JSON.stringify(body)});
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(j.error?.message||j.message||"HTTP "+r.status);
 const text=j.choices?.[0]?.message?.content;if(!text)throw new Error("không trả kết quả");return text}

async function ask(prompt,images,json){
 try{return{text:await gemini(prompt,images,json),provider:"gemini"}}
 catch(e){
  if(!FB_KEY)throw new Error("Gemini lỗi: "+e.message);
  console.error("Gemini lỗi, chuyển sang model dự phòng:",e.message);
  try{return{text:await fallback(prompt,images,json),provider:FB_MODEL}}
  catch(e2){throw new Error("Gemini: "+e.message+" | Dự phòng: "+e2.message)}}}

module.exports=async(req,res)=>{
 if(req.method!=="POST")return res.status(405).json({error:"POST only"});
 try{
  const tok=(req.headers.authorization||"").replace("Bearer ","");
  const u=await fetch(process.env.SUPABASE_URL+"/auth/v1/user",{headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:"Bearer "+tok}});
  if(!u.ok)return res.status(401).json({error:"Chưa đăng nhập"});
  const {mode,images=[],rules,trade,setups}=req.body||{};
  const imgs=images.slice(0,2);
  const list=(setups&&setups.length)?setups:(rules?[{name:"Setup",body:rules}]:[]);
  const rulesTxt=list.length?list.map((x,i)=>`### SETUP ${i+1}: ${x.name}\n${x.body}`).join("\n\n"):"(Trader chưa chọn setup – hãy nhắc họ và chấm theo quản trị rủi ro cơ bản)";
  if(mode==="rules"){
   const r=await ask(`Bạn là coach giao dịch Forex. Các ảnh là chart mẫu của setup chuẩn (H4 rồi M15 nếu có đủ). Viết bộ quy tắc setup bằng tiếng Việt, dạng gạch đầu dòng rõ ràng, kiểm chứng được: xu hướng H4, vùng/điểm vào, xác nhận M15, vị trí SL/TP, RR tối thiểu, điều kiện KHÔNG được vào lệnh. Chỉ trả về danh sách quy tắc.`,imgs,false);
   return res.json({text:r.text,provider:r.provider})}
  const prompt=`Bạn là coach kỷ luật giao dịch Forex, nghiêm khắc nhưng công bằng. Trả lời tiếng Việt.
CÁC SETUP ĐỂ ĐỐI CHIẾU:
${rulesTxt}
LỆNH: ${trade.pair} ${trade.side}, Entry ${trade.entry}, SL ${trade.sl}, TP ${trade.tp}.
GHI CHÚ: ${trade.note||"(trống)"}
ẢNH: ${imgs.length?"chart H4 rồi M15 (theo thứ tự có upload)":"không có"}.
Đối chiếu lệnh với TỪNG setup ở trên, tìm dấu hiệu FOMO/cảm tính/lệch setup. Điểm và verdict tổng lấy theo setup khớp nhất (lệnh chỉ cần tuân thủ đúng một setup là green); violations là các lỗi so với setup khớp nhất. Chỉ trả JSON thuần: {"verdict":"green|yellow|red","score":0-100,"fomo":true|false,"summary":"1-2 câu, nêu setup khớp nhất","violations":["lỗi ngắn gọn"],"per_setup":[{"name":"tên setup đúng như trên","verdict":"green|yellow|red","score":0-100,"summary":"1 câu"}]}. green=tuân thủ đúng setup, red=vi phạm rõ ràng hoặc FOMO.`;
  const r=await ask(prompt,imgs,true);
  const m=r.text.match(/\{[\s\S]*\}/);const ai=JSON.parse(m[0]);ai.provider=r.provider;
  return res.json({ai});
 }catch(e){res.status(500).json({error:e.name==="TimeoutError"?"AI phản hồi quá chậm":String(e.message||e)})}};
