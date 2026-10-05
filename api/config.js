module.exports=(req,res)=>{res.setHeader("Cache-Control","no-store");
res.json({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_ANON_KEY})};
