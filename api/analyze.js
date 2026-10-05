// Vercel Serverless Function: xác thực user (Supabase) rồi gọi Google Gemini đọc ảnh
const MODEL=process.env.GEMINI_MODEL||"gemini-3.8-flash";
module.exports=async(req,res)=>{
 if(req.method!=="POST")return res.status(405).json({error:"POST only"});
 try{
  const tok=(req.headers.authorization||"").replace("Bearer ","");
  const u=await fetch(process.env.SUPABASE_URL+"/auth/v1/user",{headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:"Bearer "+tok}});
  if(!u.ok)return res.status(401).json({error:"Chưa đăng nhập"});
  const {mode,images=[],rules,trade,setups}=req.body||{};
  const imgs=images.slice(0,2).map(i=>({inline_data:{mime_type:i.media_type||"image/jpeg",data:i.data}}));
  const list=(setups&&setups.length)?setups:(rules?[{name:"Setup",body:rules}]:[]);
  const rulesTxt=list.length?list.map((x,i)=>`### SETUP ${i+1}: ${x.name}\n${x.body}`).join("\n\n"):"(Trader chưa chọn setup – hãy nhắc họ và chấm theo quản trị rủi ro cơ bản)";
  let prompt;
  if(mode==="rules")prompt=`Bạn là coach giao dịch Forex. Các ảnh là chart mẫu của setup chuẩn (H4 rồi M15 nếu có đủ). Viết bộ quy tắc setup bằng tiếng Việt, dạng gạch đầu dòng rõ ràng, kiểm chứng được: xu hướng H4, vùng/điểm vào, xác nhận M15, vị trí SL/TP, RR tối thiểu, điều kiện KHÔNG được vào lệnh. Chỉ trả về danh sách quy tắc.`;
  else prompt=`Bạn là coach kỷ luật giao dịch Forex, nghiêm khắc nhưng công bằng. Trả lời tiếng Việt.
CÁC SETUP ĐỂ ĐỐI CHIẾU:
${rulesTxt}
LỆNH: ${trade.pair} ${trade.side}, Entry ${trade.entry}, SL ${trade.sl}, TP ${trade.tp}.
GHI CHÚ: ${trade.note||"(trống)"}
ẢNH: ${imgs.length?"chart H4 rồi M15 (theo thứ tự có upload)":"không có"}.
Đối chiếu lệnh với TỪNG setup ở trên, tìm dấu hiệu FOMO/cảm tính/lệch setup. Điểm và verdict tổng lấy theo setup khớp nhất (lệnh chỉ cần tuân thủ đúng một setup là green); violations là các lỗi so với setup khớp nhất. Chỉ trả JSON thuần: {"verdict":"green|yellow|red","score":0-100,"fomo":true|false,"summary":"1-2 câu, nêu setup khớp nhất","violations":["lỗi ngắn gọn"],"per_setup":[{"name":"tên setup đúng như trên","verdict":"green|yellow|red","score":0-100,"summary":"1 câu"}]}. green=tuân thủ đúng setup, red=vi phạm rõ ràng hoặc FOMO.`;
  const gen=mode==="rules"?{temperature:0.4}:{temperature:0.2,responseMimeType:"application/json"};
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{method:"POST",
   headers:{"content-type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},
   signal:AbortSignal.timeout(55000),
   body:JSON.stringify({contents:[{role:"user",parts:[...imgs,{text:prompt}]}],generationConfig:gen})});
  const j=await r.json();
  if(!r.ok)return res.status(502).json({error:j.error?.message||"Lỗi Gemini API"});
  const text=(j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("");
  if(!text)return res.status(502).json({error:"Gemini không trả kết quả"+(j.promptFeedback?.blockReason?" ("+j.promptFeedback.blockReason+")":"")});
  if(mode==="rules")return res.json({text});
  const m=text.match(/\{[\s\S]*\}/);return res.json({ai:JSON.parse(m[0])});
 }catch(e){res.status(500).json({error:e.name==="TimeoutError"?"Gemini phản hồi quá chậm (>55s)":String(e.message||e)})}};
