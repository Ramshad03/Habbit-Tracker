import { TouchSensor } from "@dnd-kit/core";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const DAYS   = ['Sat','Sun','Mon','Tue','Wed','Thu','Fri'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TABS   = ['Today','Weekly','Monthly','Year'];

const getTodayIdx = () => {
  const map = { 0:1, 1:2, 2:3, 3:4, 4:5, 5:6, 6:0 };
  return map[new Date().getDay()];
};
const getDateStr = (offset=0) => {
  const d = new Date(); d.setDate(d.getDate()+offset);
  return d.toISOString().split('T')[0];
};
const getWeekDates = () => {
  const ti = getTodayIdx();
  return DAYS.map((_,i) => getDateStr(i-ti));
};

const EMOJIS = ['🏋️','🧘','💻','🎮','📚','💧','🏃','🎵','🎨','🍎','😴','✍️','🐶','🌱','🧠'];
const PALETTE = [
  {bg:'#eeeeff',dot:'#4a6cf7'},{bg:'#e8f9ee',dot:'#2e9e50'},
  {bg:'#fde8ec',dot:'#c0405a'},{bg:'#e8f4ff',dot:'#4a9cf7'},
  {bg:'#fff4e0',dot:'#f5a623'},{bg:'#f3e8ff',dot:'#9b59b6'},
];
const PALETTE_DARK = [
  {bg:'#1a1a3e',dot:'#7a9cf7'},{bg:'#0e2e1e',dot:'#4ec87a'},
  {bg:'#2e0e18',dot:'#e07090'},{bg:'#0e1e2e',dot:'#7ac4f7'},
  {bg:'#2e2000',dot:'#f5c053'},{bg:'#1e0e2e',dot:'#b97fe0'},
];

export default function App() {
  const [habits, setHabits]               = useState([]);
  const [completions, setCompletions]     = useState({});
  const [activeTab, setActiveTab]         = useState('Today');

const sensors = useSensors(
  useSensor(TouchSensor, {
    activationConstraint: {
      delay: 250,   // long press
      tolerance: 5  // allow slight movement
    }
  })
);
  const [modal, setModal]                 = useState(false);
  const [selEmoji, setSelEmoji]           = useState(EMOJIS[0]);
  const [selColor, setSelColor]           = useState(0);
  const [habitName, setHabitName]         = useState('');
  const [customIcon, setCustomIcon]       = useState(null);
  const [theme, setTheme]                 = useState(()=>{
    try{ return window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'; }
    catch(e){ return 'light'; }
  });
  const [authMode, setAuthMode]           = useState('login');
  const [session, setSession]             = useState(null);
  const [profilePic, setProfilePic]       = useState(()=>localStorage.getItem('habitradar_profile_pic')||null);
  const [loginEmail, setLoginEmail]       = useState('');
  const [loginPass, setLoginPass]         = useState('');
  const [signupName, setSignupName]       = useState('');
  const [signupEmail, setSignupEmail]     = useState('');
  const [signupPass, setSignupPass]       = useState('');
  const [showLoginPass, setShowLoginPass]   = useState(false);
  const [showSignupPass, setShowSignupPass] = useState(false);
  const [authErr, setAuthErr]             = useState('');
  const [authLoad, setAuthLoad]           = useState(false);
  const [showProfile, setShowProfile]     = useState(false);
  const [loading, setLoading]             = useState(true);
  const [timeLeft, setTimeLeft]           = useState('');
  const [selHabitYear, setSelHabitYear]   = useState(null);
  const [isResetting, setIsResetting]     = useState(false);
  const [newPassword, setNewPassword]     = useState('');
  const [resetMsg, setResetMsg]           = useState('');



  // All drag refs — no state, just refs to avoid stale closures
  const lpTimer      = useRef(null);  // long press timer
  const fingerDown   = useRef(false); // is finger currently touching screen?
  const startX       = useRef(0);
  const startY       = useRef(0);
  const moved        = useRef(false); // did finger move > 10px?
  const dragIdxRef   = useRef(null);  // mirror of dragIdx for use inside events
  const dragReadyRef = useRef(false); // mirror of dragReady

  // Swipe refs
  const swipeX = useRef(null);
  const swipeY = useRef(null);

  const TODAY_IDX  = getTodayIdx();
  const TODAY_DATE = getDateStr();
  const WEEK_DATES = getWeekDates();

  const isDark      = theme==='dark';
  const getPal      = i => isDark?PALETTE_DARK[i%6]:PALETTE[i%6];
  const cardBg      = ()=> isDark?'#252540':'#fff';
  const phoneBg     = ()=> isDark?'#1a1a2e':'#f7f8fa';
  const textPrimary = ()=> isDark?'#f0f0f0':'#1a1a2e';
  const textMuted   = ()=> isDark?'#666':'#aaa';
  const progBg      = ()=> isDark?'#2a2a42':'#ececec';
  const tabBarBg    = ()=> isDark?'#2a2a42':'#e4e4e4';
  const getInitials = n => n?n.trim().split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2):'?';
  const getGreet    = ()=>{ const h=new Date().getHours(); return h<12?'Good morning ☀️':h<18?'Good afternoon 🌤️':'Good evening 🌙'; };
  const isDone      = (id,date)=>!!completions[`${id}:${date}`];
  const isTodayDone = id=>isDone(id,TODAY_DATE);
  const getStreak   = id=>Object.keys(completions).filter(k=>k.startsWith(id+':')&&completions[k]).length;

  /* ══════════════════════════════════════
     DRAG — completely rewritten
     Key rule: timer ONLY fires if
     fingerDown.current is STILL true
  ══════════════════════════════════════ */
  const clearLP = () => {
    clearTimeout(lpTimer.current);
    lpTimer.current = null;
  };

  /* ══════════════════════════════════════
     SWIPE TO CHANGE TAB
  ══════════════════════════════════════ */
  const onSwipeStart = (e) => {
    if (dragReadyRef.current) return;
    swipeX.current = e.touches[0].clientX;
    swipeY.current = e.touches[0].clientY;
  };

  const onSwipeEnd = (e) => {
    if (dragReadyRef.current) return;
    if (swipeX.current === null) return;
    const dx = swipeX.current - e.changedTouches[0].clientX;
    const dy = Math.abs(swipeY.current - e.changedTouches[0].clientY);
    swipeX.current = null;
    // Must be > 60px horizontal and more horizontal than vertical
    if (Math.abs(dx) < 60 || Math.abs(dx) < dy * 1.5) return;
    const cur = TABS.indexOf(activeTab);
    if (dx > 0 && cur < TABS.length-1) setActiveTab(TABS[cur+1]); // left swipe → next
    if (dx < 0 && cur > 0) setActiveTab(TABS[cur-1]);             // right swipe → prev
  };

  /* ══════════════════════════════════════
     AUTH & DATA
  ══════════════════════════════════════ */
  useEffect(()=>{
    const hash=window.location.hash;
    if(hash.includes('type=recovery')) setIsResetting(true);
  },[]);

  useEffect(()=>{
    const calc=()=>{
      const now=new Date(),mid=new Date(); mid.setHours(24,0,0,0);
      const d=mid-now;
      setTimeLeft(`${String(Math.floor(d/3600000)).padStart(2,'0')}:${String(Math.floor((d%3600000)/60000)).padStart(2,'0')}:${String(Math.floor((d%60000)/1000)).padStart(2,'0')}`);
    };
    calc(); const t=setInterval(calc,1000); return()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    if(!session) return;
    const send=()=>{
      const rem=habits.filter(h=>!isTodayDone(h.id)).length;
      if(rem===0) return;
      if('Notification'in window&&Notification.permission==='granted'){
        new Notification('⏰ Habit Radar Reminder!',{
          body:`You have ${rem} habit${rem>1?'s':''} left! Only 3 hours until midnight! 🔥`,
          icon:'/logo192.png',tag:'habit-reminder',renotify:true,
        });
      }
    };
    const schedule=()=>{
      const now=new Date(),rem=new Date(); rem.setHours(21,0,0,0);
      if(now>rem) rem.setDate(rem.getDate()+1);
      const t=setTimeout(()=>{send();setInterval(send,86400000);},rem-now);
      return()=>clearTimeout(t);
    };
    if('Notification'in window) Notification.requestPermission();
    return schedule();
  },[session,habits,completions]);

  useEffect(()=>{ document.body.style.background=isDark?'#1a1a2e':'#f7f8fa'; },[isDark]);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setSession(session); if(session) loadData(session.user.id); setLoading(false);
    });
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      setSession(session); if(session) loadData(session.user.id);
    });
    return()=>subscription.unsubscribe();
  },[]);

  const loadData = async uid => {
    const{data:hData}=await supabase.from('habits').select('*').eq('user_id',uid).order('order_index',{ascending:true});
    if(hData){ setHabits(hData); if(hData.length>0) setSelHabitYear(hData[0].id); }
    const{data:cData}=await supabase.from('habit_completions').select('*').eq('user_id',uid);
    if(cData){ const m={}; cData.forEach(c=>{ m[`${c.habit_id}:${c.date}`]=c.completed; }); setCompletions(m); }
  };

  const toggleToday = async hId => {
    const key=`${hId}:${TODAY_DATE}`,cur=!!completions[key],nv=!cur;
    setCompletions(p=>({...p,[key]:nv}));
    await supabase.from('habit_completions').upsert({
      habit_id:hId,user_id:session.user.id,date:TODAY_DATE,completed:nv
    },{onConflict:'habit_id,date'});
  };

  const saveHabit = async () => {
    if(!habitName.trim()) return;
    const{data,error}=await supabase.from('habits').insert({
      user_id:session.user.id, name:habitName.trim(),
      icon:customIcon?'custom':selEmoji,
      custom_icon:customIcon||'',
      color_idx:selColor,
      order_index:habits.length,
    }).select().single();
    if(!error&&data){ setHabits(p=>[...p,data]); if(!selHabitYear) setSelHabitYear(data.id); }
    setModal(false); setHabitName(''); setCustomIcon(null);
  };

  const deleteHabit = async (hId,name) => {
    if(!window.confirm(`Remove "${name}"?`)) return;
    setHabits(p=>p.filter(h=>h.id!==hId));
    if(selHabitYear===hId) setSelHabitYear(habits.find(h=>h.id!==hId)?.id||null);
    await supabase.from('habits').delete().eq('id',hId);
  };

  const doLogin = async () => {
    setAuthErr(''); setAuthLoad(true);
    if(!loginEmail){setAuthErr('Please enter your email');setAuthLoad(false);return;}
    if(!loginPass){setAuthErr('Please enter your password');setAuthLoad(false);return;}
    const{error}=await supabase.auth.signInWithPassword({email:loginEmail,password:loginPass});
    if(error) setAuthErr(error.message); setAuthLoad(false);
  };

  const doSignup = async () => {
    setAuthErr(''); setAuthLoad(true);
    if(!signupName){setAuthErr('Please enter your name');setAuthLoad(false);return;}
    if(!signupEmail||!signupEmail.includes('@')){setAuthErr('Please enter a valid email');setAuthLoad(false);return;}
    if(signupPass.length<6){setAuthErr('Password must be at least 6 characters');setAuthLoad(false);return;}
    const{error}=await supabase.auth.signUp({email:signupEmail,password:signupPass,options:{data:{full_name:signupName}}});
    if(error) setAuthErr(error.message);
    else setAuthErr('✅ Account created! You can now login.');
    setAuthLoad(false);
  };

  const doLogout = async () => {
    await supabase.auth.signOut();
    setHabits([]); setCompletions({}); setProfilePic(null);
    localStorage.removeItem('habitradar_profile_pic'); setShowProfile(false);
  };

  const handleFileUpload = e => {
    const file=e.target.files[0]; if(!file) return;
    const r=new FileReader();
    r.onload=ev=>{ setProfilePic(ev.target.result); localStorage.setItem('habitradar_profile_pic',ev.target.result); };
    r.readAsDataURL(file); e.target.value='';
  };

  const handleIconUpload = e => {
    const file=e.target.files[0]; if(!file) return;
    const r=new FileReader();
    r.onload=ev=>setCustomIcon(ev.target.result);
    r.readAsDataURL(file); e.target.value='';
  };

  const removeProfilePic=()=>{ setProfilePic(null); localStorage.removeItem('habitradar_profile_pic'); };

  const inputSt=(extra={})=>({
    width:'100%',padding:'12px 14px',borderRadius:14,fontFamily:'Nunito,sans-serif',
    fontSize:13,fontWeight:700,outline:'none',
    border:`2px solid ${isDark?'#3a3a5c':'#ececec'}`,
    background:isDark?'#252540':'#fff',color:isDark?'#f0f0f0':'#1a1a2e',
    boxSizing:'border-box',...extra,
  });

  /* ── HABIT ICON ── */
  const HabitIcon = ({habit,size=46,radius=15}) => (
    <div style={{width:size,height:size,borderRadius:radius,background:getPal(habit.color_idx).bg,
      display:'flex',alignItems:'center',justifyContent:'center',
      fontSize:size*0.45,flexShrink:0,overflow:'hidden'}}>
      {habit.custom_icon
        ?<img src={habit.custom_icon} alt="icon" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
        :habit.icon}
    </div>
  );

  /* ── DRAGGABLE CARD ── */
 const DraggableCard = ({ habit, children }) => {
  const {
    attributes,
    listeners, 
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: habit.id });

  const p = getPal(habit.color_idx);

 const style = {
  transform: transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${isDragging ? 1.05 : 1})`
    : undefined,
  transition,
  opacity: isDragging ? 0.95 : 1,
  zIndex: isDragging ? 1000 : 1,
  position: "relative",
  borderRadius: 20,
  cursor: isDragging ? "grabbing" : "grab",
  boxShadow: isDragging
    ? `0 15px 40px rgba(0,0,0,0.3)`
    : "0 2px 12px rgba(0,0,0,0.1)"
};

  return (
    <div
  ref={setNodeRef}
  {...attributes}
  {...listeners}
  style={style}
>
      
  <div style={{ position: "relative" }}>

  {/* REAL DRAG HANDLE */}
  <div
  {...listeners}
  style={{
    position: "absolute",
    top: 10,
    right: 10,
    transform: "none",
    background: p.dot,
    borderRadius: 20,
    padding: "8px 18px",
    zIndex: 20,
    cursor: "grab",
    opacity: 0.8
  }}
>
  <span>Drag</span>
</div>

  {/* CARD CONTENT */}
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <div style={{ flex: 1 }}>
      {children}
    </div>
  </div>

</div>

      </div>
   
  );
};
  /* ── MONTHLY DOTS ── */
  const MonthlyDots = ({hId,colorIdx}) => {
    const now=new Date(),year=now.getFullYear(),month=now.getMonth();
    const dim=new Date(year,month+1,0).getDate();
    const p=getPal(colorIdx);
    return(
      <div style={{display:'flex',flexWrap:'wrap',gap:4,marginTop:10}}>
        {Array.from({length:dim},(_,i)=>{
          const dateStr=`${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
          const done=isDone(hId,dateStr);
          const isToday=dateStr===TODAY_DATE;
          return(
            <div key={i} style={{width:26,height:26,borderRadius:8,
              background:done?p.dot:isDark?'#2a2a42':'#ececec',
              display:'flex',alignItems:'center',justifyContent:'center',
              border:isToday?`2px solid ${p.dot}`:'2px solid transparent',
              fontSize:9,fontWeight:800,color:done?'#fff':textMuted()}}>
              {i+1}
            </div>
          );
        })}
      </div>
    );
  };

  /* ── YEAR HEATMAP ── */
  const YearHeatmap = ({hId,colorIdx}) => {
    const p=getPal(colorIdx);
    const now=new Date(),year=now.getFullYear();
    const months=[];
    for(let m=0;m<12;m++){
      const dim=new Date(year,m+1,0).getDate();
      const firstDay=new Date(year,m,1).getDay();
      const days=[];
      for(let pad=0;pad<firstDay;pad++) days.push(null);
      for(let d=1;d<=dim;d++){
        days.push({date:`${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,day:d});
      }
      const weeks=[];
      for(let i=0;i<days.length;i+=7) weeks.push(days.slice(i,i+7));
      months.push({label:MONTHS[m],weeks});
    }
    return(
      <div style={{overflowX:'auto',paddingBottom:8}}>
        <div style={{display:'flex',gap:6,minWidth:'max-content'}}>
          {months.map((mo,mi)=>(
            <div key={mi} style={{display:'flex',flexDirection:'column',gap:3}}>
              <div style={{fontSize:8,fontWeight:800,color:textMuted(),marginBottom:2,textAlign:'center'}}>{mo.label}</div>
              <div style={{display:'flex',gap:2}}>
                {mo.weeks.map((week,wi)=>(
                  <div key={wi} style={{display:'flex',flexDirection:'column',gap:2}}>
                    {Array.from({length:7},(_,di)=>{
                      const day=week[di];
                      if(!day) return <div key={di} style={{width:9,height:9}}/>;
                      const done=isDone(hId,day.date);
                      const isToday=day.date===TODAY_DATE;
                      const isFuture=new Date(day.date)>now;
                      return(
                        <div key={di} style={{width:9,height:9,borderRadius:2,
                          background:isFuture?(isDark?'#2a2a42':'#f0f0f0'):done?p.dot:(isDark?'#2a2a42':'#e0e0e0'),
                          border:isToday?`1.5px solid ${p.dot}`:'none',opacity:isFuture?0.3:1}}/>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16,marginTop:12,justifyContent:'flex-end'}}>
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            <div style={{width:10,height:10,borderRadius:2,background:isDark?'#2a2a42':'#e0e0e0'}}/>
            <span style={{fontSize:10,fontWeight:700,color:textMuted()}}>Not completed</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            <div style={{width:10,height:10,borderRadius:2,background:p.dot}}/>
            <span style={{fontSize:10,fontWeight:700,color:textMuted()}}>Completed</span>
          </div>
        </div>
      </div>
    );
  };

  /* ── LOADING ── */
  if(loading) return(
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,
      background:isDark?'#1a1a2e':'#f7f8fa',display:'flex',alignItems:'center',
      justifyContent:'center',flexDirection:'column',gap:16,fontFamily:'Nunito,sans-serif'}}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{fontSize:56}}>📡</div>
      <div style={{fontSize:18,fontWeight:800,color:'#4caf50'}}>Loading Habit Radar...</div>
    </div>
  );

  /* ── PASSWORD RESET ── */
  if(isResetting) return(
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:phoneBg(),
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      fontFamily:'Nunito,sans-serif',padding:'0 24px'}}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{width:'100%',maxWidth:400}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{width:70,height:70,borderRadius:24,background:'linear-gradient(135deg,#4caf50,#66bb6a)',
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:32,
            margin:'0 auto 14px',boxShadow:'0 6px 20px rgba(76,175,80,0.35)'}}>🔑</div>
          <div style={{fontSize:22,fontWeight:900,color:isDark?'#f0f0f0':'#1a1a2e',marginBottom:6}}>Reset Password</div>
          <div style={{fontSize:13,fontWeight:700,color:textMuted()}}>Enter your new password below</div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:10,fontWeight:800,color:isDark?'#666':'#aaa',letterSpacing:0.8,marginBottom:6,display:'block'}}>NEW PASSWORD</label>
          <input type="password" placeholder="Min 6 characters"
            value={newPassword} onChange={e=>setNewPassword(e.target.value)} style={inputSt()}/>
        </div>
        {resetMsg&&(
          <div style={{fontSize:12,fontWeight:700,marginBottom:14,padding:'10px 14px',borderRadius:12,
            background:resetMsg.startsWith('✅')?'#e8f9ee':'#fde8e8',
            color:resetMsg.startsWith('✅')?'#2e9e50':'#e74c3c'}}>{resetMsg}</div>
        )}
        <button type="button" onClick={async()=>{
          if(newPassword.length<6){setResetMsg('❌ Min 6 characters!');return;}
          const{error}=await supabase.auth.updateUser({password:newPassword});
          if(error) setResetMsg('❌ '+error.message);
          else{ setResetMsg('✅ Password updated!');
            setTimeout(()=>{ setIsResetting(false); window.location.hash=''; window.location.reload(); },2000); }
        }}
          style={{width:'100%',padding:15,borderRadius:16,border:'none',
            background:'linear-gradient(135deg,#4caf50,#66bb6a)',fontFamily:'Nunito,sans-serif',
            fontSize:16,fontWeight:900,color:'#fff',cursor:'pointer',marginBottom:12}}>
          Update Password →
        </button>
        <button type="button" onClick={()=>{setIsResetting(false);window.location.hash='';}}
          style={{width:'100%',padding:13,borderRadius:16,border:`2px solid ${isDark?'#3a3a5c':'#ececec'}`,
            background:'transparent',fontFamily:'Nunito,sans-serif',fontSize:14,fontWeight:800,
            color:textMuted(),cursor:'pointer'}}>← Back to Login</button>
      </div>
    </div>
  );

  /* ── AUTH ── */
  if(!session) return(
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:phoneBg(),
      overflowY:'auto',display:'flex',flexDirection:'column',alignItems:'center',
      justifyContent:'center',fontFamily:'Nunito,sans-serif'}}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{width:'100%',maxWidth:440,padding:'24px',boxSizing:'border-box'}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',marginBottom:28}}>
          <div style={{width:76,height:76,borderRadius:24,background:'linear-gradient(135deg,#4caf50,#66bb6a)',
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:36,marginBottom:14,
            boxShadow:'0 6px 20px rgba(76,175,80,0.35)'}}>📡</div>
          <div style={{fontSize:26,fontWeight:900,color:isDark?'#f0f0f0':'#1a1a2e',letterSpacing:-0.5,marginBottom:6}}>
            Habit <span style={{color:'#4caf50'}}>Radar</span></div>
          <div style={{fontSize:13,fontWeight:700,color:textMuted()}}>Build habits. Track progress. Win every day.</div>
        </div>
        <div style={{display:'flex',background:tabBarBg(),borderRadius:50,padding:3,gap:2,marginBottom:24}}>
          {['login','signup'].map(m=>(
            <button key={m} type="button" onClick={()=>{setAuthMode(m);setAuthErr('');}}
              style={{flex:1,padding:'10px 0',borderRadius:50,border:'none',cursor:'pointer',
                fontFamily:'Nunito,sans-serif',fontWeight:800,fontSize:14,
                background:authMode===m?'linear-gradient(135deg,#4caf50,#66bb6a)':'transparent',
                color:authMode===m?'#fff':isDark?'#666':'#999',
                boxShadow:authMode===m?'0 3px 10px rgba(76,175,80,0.35)':'none'}}>
              {m==='login'?'Login':'Sign Up'}
            </button>
          ))}
        </div>

        {authMode==='login'&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <label style={{fontSize:10,fontWeight:800,color:isDark?'#666':'#aaa',letterSpacing:0.8,marginBottom:6,display:'block'}}>EMAIL</label>
              <input type="email" placeholder="you@email.com" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} style={inputSt()}/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:800,color:isDark?'#666':'#aaa',letterSpacing:0.8,marginBottom:6,display:'block'}}>PASSWORD</label>
              <div style={{position:'relative'}}>
                <input type={showLoginPass?'text':'password'} placeholder="Enter your password"
                  value={loginPass} onChange={e=>setLoginPass(e.target.value)} style={inputSt({paddingRight:48})}/>
                <button type="button" onClick={()=>setShowLoginPass(!showLoginPass)}
                  style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',
                    background:'none',border:'none',cursor:'pointer',fontSize:18,color:'#aaa',padding:4}}>
                  {showLoginPass?'🙈':'👁️'}
                </button>
              </div>
            </div>
            <div style={{fontSize:12,fontWeight:800,color:'#4caf50',textAlign:'right',cursor:'pointer'}}
              onClick={async()=>{
                const email=loginEmail.trim();
                if(!email){setAuthErr('⚠️ Please enter your email first!');return;}
                setAuthLoad(true);
                const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:'https://habit-radar.netlify.app'});
                setAuthLoad(false);
                if(error) setAuthErr(error.message);
                else setAuthErr('✅ Reset email sent! Check your inbox.');
              }}>
              {authLoad?'Sending...':'Forgot password?'}
            </div>
            {authErr&&(
              <div style={{fontSize:12,fontWeight:700,padding:'10px 14px',borderRadius:12,
                background:authErr.startsWith('✅')?isDark?'#0e2e1e':'#e8f9ee':isDark?'#2e0e18':'#fde8e8',
                color:authErr.startsWith('✅')?'#2e9e50':'#e74c3c'}}>{authErr}</div>
            )}
            <button type="button" onClick={doLogin} disabled={authLoad}
              style={{width:'100%',padding:15,borderRadius:16,border:'none',
                background:'linear-gradient(135deg,#4caf50,#66bb6a)',fontFamily:'Nunito,sans-serif',
                fontSize:16,fontWeight:900,color:'#fff',cursor:'pointer',opacity:authLoad?0.7:1}}>
              {authLoad?'Logging in...':'Login →'}
            </button>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <hr style={{flex:1,border:'none',borderTop:`1.5px solid ${isDark?'#3a3a5c':'#ececec'}`}}/>
              <span style={{fontSize:12,color:textMuted()}}>or</span>
              <hr style={{flex:1,border:'none',borderTop:`1.5px solid ${isDark?'#3a3a5c':'#ececec'}`}}/>
            </div>
            <button type="button" onClick={async()=>{const{error}=await supabase.auth.signInAnonymously();if(error)setAuthErr(error.message);}}
              style={{width:'100%',padding:13,borderRadius:16,border:`2px solid ${isDark?'#3a3a5c':'#ececec'}`,
                background:isDark?'#252540':'#fff',color:isDark?'#aaa':'#555',
                fontFamily:'Nunito,sans-serif',fontSize:14,fontWeight:800,cursor:'pointer'}}>
              🎭 Continue as Guest
            </button>
          </div>
        )}

        {authMode==='signup'&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <label style={{fontSize:10,fontWeight:800,color:isDark?'#666':'#aaa',letterSpacing:0.8,marginBottom:6,display:'block'}}>FULL NAME</label>
              <input type="text" placeholder="Your full name" value={signupName} onChange={e=>setSignupName(e.target.value)} style={inputSt()}/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:800,color:isDark?'#666':'#aaa',letterSpacing:0.8,marginBottom:6,display:'block'}}>EMAIL</label>
              <input type="email" placeholder="you@email.com" value={signupEmail} onChange={e=>setSignupEmail(e.target.value)} style={inputSt()}/>
            </div>
            <div>
              <label style={{fontSize:10,fontWeight:800,color:isDark?'#666':'#aaa',letterSpacing:0.8,marginBottom:6,display:'block'}}>PASSWORD</label>
              <div style={{position:'relative'}}>
                <input type={showSignupPass?'text':'password'} placeholder="Min 6 characters"
                  value={signupPass} onChange={e=>setSignupPass(e.target.value)} style={inputSt({paddingRight:48})}/>
                <button type="button" onClick={()=>setShowSignupPass(!showSignupPass)}
                  style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',
                    background:'none',border:'none',cursor:'pointer',fontSize:18,color:'#aaa',padding:4}}>
                  {showSignupPass?'🙈':'👁️'}
                </button>
              </div>
            </div>
            {authErr&&(
              <div style={{fontSize:12,fontWeight:700,padding:'10px 14px',borderRadius:12,
                background:authErr.startsWith('✅')?isDark?'#0e2e1e':'#e8f9ee':isDark?'#2e0e18':'#fde8e8',
                color:authErr.startsWith('✅')?'#2e9e50':'#e74c3c'}}>{authErr}</div>
            )}
            <button type="button" onClick={doSignup} disabled={authLoad}
              style={{width:'100%',padding:15,borderRadius:16,border:'none',
                background:'linear-gradient(135deg,#4caf50,#66bb6a)',fontFamily:'Nunito,sans-serif',
                fontSize:16,fontWeight:900,color:'#fff',cursor:'pointer',opacity:authLoad?0.7:1}}>
              {authLoad?'Creating account...':'Create Account →'}
            </button>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <hr style={{flex:1,border:'none',borderTop:`1.5px solid ${isDark?'#3a3a5c':'#ececec'}`}}/>
              <span style={{fontSize:12,color:textMuted()}}>or</span>
              <hr style={{flex:1,border:'none',borderTop:`1.5px solid ${isDark?'#3a3a5c':'#ececec'}`}}/>
            </div>
            <button type="button" onClick={async()=>{const{error}=await supabase.auth.signInAnonymously();if(error)setAuthErr(error.message);}}
              style={{width:'100%',padding:13,borderRadius:16,border:`2px solid ${isDark?'#3a3a5c':'#ececec'}`,
                background:isDark?'#252540':'#fff',color:isDark?'#aaa':'#555',
                fontFamily:'Nunito,sans-serif',fontSize:14,fontWeight:800,cursor:'pointer'}}>
              🎭 Continue as Guest
            </button>
          </div>
        )}
      </div>
    </div>
  );

  /* ── MAIN APP ── */
  const userName  = session.user.user_metadata?.full_name||session.user.email?.split('@')[0]||'Friend';
  const todayDone = habits.filter(h=>isTodayDone(h.id)).length;
  const total     = habits.length;
  const pct       = total?Math.round((todayDone/total)*100):0;
  const msgs      = ["Let's do this! 💪","Great start! 🔥","Almost there! ⭐","All done! 🎉"];
  const mi        = todayDone===total&&total>0?3:todayDone>=2?2:todayDone===1?1:0;

  return(
    <>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:phoneBg(),zIndex:-1}}/>
      <div
        style={{position:'fixed',top:0,left:0,right:0,bottom:0,overflowY:'auto',fontFamily:'Nunito,sans-serif'}}
        onTouchStart={onSwipeStart}
        onTouchEnd={onSwipeEnd}>
        <div style={{width:'100%',maxWidth:480,margin:'0 auto',minHeight:'100%',
          background:phoneBg(),display:'flex',flexDirection:'column',position:'relative'}}>

          {/* Header */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
            padding:'16px 20px 0',position:'sticky',top:0,background:phoneBg(),zIndex:10}}>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <div style={{width:22,height:2.5,background:'#4caf50',borderRadius:2}}/>
              <div style={{width:15,height:2.5,background:'#4caf50',borderRadius:2}}/>
            </div>
            <h1 style={{margin:0,fontSize:22,fontWeight:900,color:isDark?'#f0f0f0':'#1a1a2e',letterSpacing:-0.5}}>
              Habit <span style={{color:'#4caf50'}}>Radar</span>
            </h1>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <button type="button" onClick={()=>setTheme(isDark?'light':'dark')}
                style={{width:36,height:36,borderRadius:'50%',border:'none',cursor:'pointer',
                  background:isDark?'#2a2a42':'#e4e4e4',fontSize:18,
                  display:'flex',alignItems:'center',justifyContent:'center'}}>
                {isDark?'☀️':'🌙'}
              </button>
              <div onClick={()=>setShowProfile(true)}
                style={{width:38,height:38,borderRadius:'50%',cursor:'pointer',overflow:'hidden',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  border:'2.5px solid #ffb300',background:'linear-gradient(135deg,#4caf50,#66bb6a)',
                  flexShrink:0,boxShadow:'0 2px 8px rgba(255,152,0,0.4)'}}>
                {profilePic
                  ?<img src={profilePic} alt="p" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                  :<span style={{fontSize:14,fontWeight:900,color:'#fff'}}>{getInitials(userName)}</span>}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{display:'flex',margin:'14px 16px 0',background:tabBarBg(),borderRadius:50,padding:3,gap:2}}>
            {TABS.map(t=>(
              <button key={t} type="button" onClick={()=>setActiveTab(t)}
                style={{flex:1,padding:'8px 0',borderRadius:50,border:'none',cursor:'pointer',
                  fontFamily:'Nunito,sans-serif',fontWeight:800,fontSize:11,
                  background:activeTab===t?'linear-gradient(135deg,#4caf50,#66bb6a)':'transparent',
                  color:activeTab===t?'#fff':isDark?'#666':'#999',
                  boxShadow:activeTab===t?'0 3px 10px rgba(76,175,80,0.35)':'none'}}>
                {t}
              </button>
            ))}
          </div>

          {/* Hint */}
          <div style={{textAlign:'center',fontSize:10,fontWeight:700,color:textMuted(),padding:'5px 0 0',opacity:0.5}}>
            ← Swipe to switch tabs
            {habits.length>1&&['Today','Weekly','Monthly'].includes(activeTab)&&' · Hold 3s to reorder'}
          </div>

          {/* TODAY */}
          {activeTab==='Today'&&(
  <div style={{padding:'12px 16px 120px',display:'flex',flexDirection:'column',gap:12}}>

    {/* TOP CARD stays SAME */}

    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={async ({active, over}) => {
        if (!over || active.id === over.id) return;

        const oldIndex = habits.findIndex(h => h.id === active.id);
        const newIndex = habits.findIndex(h => h.id === over.id);

        const newArr = arrayMove(habits, oldIndex, newIndex);
        setHabits(newArr);

        await supabase.from('habits').upsert(
  newArr.map((h, i) => ({
    id: h.id,
    order_index: i
  }))
);
      }}
    >

      <SortableContext
        items={habits.map(h => h.id)}
        strategy={verticalListSortingStrategy}
      >

        {habits.map((hb)=>{
          const d = isTodayDone(hb.id);
          const p = getPal(hb.color_idx);

          return (
            <DraggableCard key={hb.id} habit={hb}>
              <div style={{
                background: p.bg,
                borderRadius: 20,
                padding: "14px 16px",
                boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <HabitIcon habit={hb} size={44} radius={14} />

                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: textPrimary() }}>
                      {hb.name}
                    </div>

                    <div style={{ fontSize: 12, fontWeight: 700, color: textMuted() }}>
                      🔥 {getStreak(hb.id)} Days
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => toggleToday(hb.id)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    border: "none",
                    background: d ? "#4caf50" : progBg(),
                    color: "#fff",
                    fontWeight: 900,
                    cursor: "pointer"
                  }}
                >
                  {d ? "✓" : ""}
                </button>
              </div>
            </DraggableCard>
          );
        })}

      </SortableContext>
    </DndContext>

  </div>
)}

          {/* WEEKLY */}
          {activeTab==='Weekly'&&(
            <div style={{padding:'12px 16px 120px',display:'flex',flexDirection:'column',gap:12}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 4px 4px'}}>
                <span style={{fontSize:13,fontWeight:800,color:textMuted()}}>This week's progress</span>
                <span style={{fontSize:10,fontWeight:800,color:textMuted(),
                  background:isDark?'#2a2a42':'#f0f0f0',borderRadius:20,padding:'3px 10px'}}>👁 View only</span>
              </div>
              {habits.map((hb,i)=>{
                const p=getPal(hb.color_idx);
                return(
                  <DraggableCard key={hb.id} habit={hb} idx={i}>
                    <div style={{background:p.bg,borderRadius:20,padding:'14px 16px',boxShadow:'0 2px 12px rgba(0,0,0,0.1)'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <HabitIcon habit={hb} size={38} radius={12}/>
                          <div>
                            <div style={{fontSize:14,fontWeight:800,color:isDark?'#e0e0e0':'#1a1a2e'}}>{hb.name}</div>
                            <div style={{fontSize:12,fontWeight:700,color:isDark?'#888':'#aaa'}}>🔥 {getStreak(hb.id)} Days</div>
                          </div>
                        </div>
                        <span style={{fontSize:10,fontWeight:800,color:isDark?'#666':'#bbb'}}>Everyday</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between'}}>
                        {DAYS.map((day,di)=>{
                          const done=isDone(hb.id,WEEK_DATES[di]);
                          const isToday=di===TODAY_IDX;
                          return(
                            <div key={di} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                              <span style={{fontSize:10,fontWeight:800,
                                color:isToday?(isDark?'#aaa':'#555'):(isDark?'#555':'#bbb')}}>{day}</span>
                              <div style={{width:30,height:30,borderRadius:'50%',display:'flex',
                                alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,
                                background:done?p.dot:'rgba(255,255,255,0.25)',
                                border:done?'none':'2px solid rgba(255,255,255,0.3)'}}>
                                {done?<span style={{color:'#fff'}}>✓</span>:null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </DraggableCard>
                );
              })}
            </div>
          )}

          {/* MONTHLY */}
          {activeTab==='Monthly'&&(
            <div style={{padding:'12px 16px 120px',display:'flex',flexDirection:'column',gap:12}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 4px 4px'}}>
                <span style={{fontSize:13,fontWeight:800,color:textPrimary()}}>
                  {MONTHS[new Date().getMonth()]} {new Date().getFullYear()}</span>
                <span style={{fontSize:10,fontWeight:800,color:textMuted(),
                  background:isDark?'#2a2a42':'#f0f0f0',borderRadius:20,padding:'3px 10px'}}>📅 This Month</span>
              </div>
              {habits.length===0&&(
                <div style={{textAlign:'center',padding:'60px 20px',color:textMuted()}}>
                  <div style={{fontSize:48,marginBottom:12}}>🌱</div>
                  <div style={{fontSize:16,fontWeight:700}}>No habits yet!</div>
                </div>
              )}
              {habits.map((hb,i)=>{
                const now=new Date();
                const dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
                const doneDays=Array.from({length:dim},(_,j)=>{
                  const mo=String(now.getMonth()+1).padStart(2,'0');
                  const dy=String(j+1).padStart(2,'0');
                  return isDone(hb.id,`${now.getFullYear()}-${mo}-${dy}`)?1:0;
                }).filter(Boolean).length;
                return(
                  <DraggableCard key={hb.id} habit={hb} idx={i}>
                    <div style={{background:cardBg(),borderRadius:20,padding:'14px 16px',boxShadow:'0 2px 12px rgba(0,0,0,0.1)'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                        <div style={{display:'flex',alignItems:'center',gap:12}}>
                          <HabitIcon habit={hb} size={44} radius={14}/>
                          <div>
                            <div style={{fontSize:15,fontWeight:800,color:textPrimary()}}>{hb.name}</div>
                            <div style={{fontSize:12,fontWeight:700,color:textMuted()}}>✅ {doneDays}/{dim} days</div>
                          </div>
                        </div>
                        <button type="button" onClick={()=>deleteHabit(hb.id,hb.name)}
                          style={{width:36,height:36,borderRadius:'50%',border:'none',
                            background:'#fde8e8',cursor:'pointer',fontSize:17,
                            display:'flex',alignItems:'center',justifyContent:'center'}}>🗑️</button>
                      </div>
                      <MonthlyDots hId={hb.id} colorIdx={hb.color_idx}/>
                    </div>
                  </DraggableCard>
                );
              })}
            </div>
          )}

          {/* YEAR */}
          {activeTab==='Year'&&(
            <div style={{padding:'12px 16px 120px',display:'flex',flexDirection:'column',gap:12}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 4px 4px'}}>
                <span style={{fontSize:13,fontWeight:800,color:textPrimary()}}>{new Date().getFullYear()} Overview</span>
                <span style={{fontSize:10,fontWeight:800,color:textMuted(),
                  background:isDark?'#2a2a42':'#f0f0f0',borderRadius:20,padding:'3px 10px'}}>📊 Year</span>
              </div>
              {habits.length>0&&(
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {habits.map(hb=>{
                    const p=getPal(hb.color_idx); const sel=selHabitYear===hb.id;
                    return(
                      <button key={hb.id} type="button" onClick={()=>setSelHabitYear(hb.id)}
                        style={{padding:'6px 12px',borderRadius:50,
                          border:`2px solid ${sel?p.dot:isDark?'#3a3a5c':'#ececec'}`,
                          background:sel?p.bg:isDark?'#252540':'#fff',
                          color:sel?p.dot:textMuted(),
                          fontFamily:'Nunito,sans-serif',fontSize:12,fontWeight:800,cursor:'pointer',
                          display:'flex',alignItems:'center',gap:6}}>
                        <HabitIcon habit={hb} size={20} radius={6}/>
                        {hb.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {selHabitYear&&(()=>{
                const hb=habits.find(h=>h.id===selHabitYear); if(!hb) return null;
                const p=getPal(hb.color_idx);
                const totalDone=getStreak(hb.id);
                const now=new Date();
                const dayOfYear=Math.floor((now-new Date(now.getFullYear(),0,0))/(1000*60*60*24));
                return(
                  <div style={{background:cardBg(),borderRadius:20,padding:'16px',boxShadow:'0 2px 12px rgba(0,0,0,0.1)'}}>
                    <div style={{display:'flex',gap:12,marginBottom:16}}>
                      <div style={{flex:1,background:isDark?'#2a2a42':'#f7f8fa',borderRadius:14,padding:'12px',textAlign:'center'}}>
                        <div style={{fontSize:22,fontWeight:900,color:p.dot}}>{totalDone}</div>
                        <div style={{fontSize:10,fontWeight:800,color:textMuted()}}>Total Days</div>
                      </div>
                      <div style={{flex:1,background:isDark?'#2a2a42':'#f7f8fa',borderRadius:14,padding:'12px',textAlign:'center'}}>
                        <div style={{fontSize:22,fontWeight:900,color:'#4caf50'}}>
                          {dayOfYear>0?Math.round((totalDone/dayOfYear)*100):0}%</div>
                        <div style={{fontSize:10,fontWeight:800,color:textMuted()}}>Completion</div>
                      </div>
                      <div style={{flex:1,background:isDark?'#2a2a42':'#f7f8fa',borderRadius:14,padding:'12px',textAlign:'center'}}>
                        <div style={{fontSize:22,fontWeight:900,color:'#f5a623'}}>{totalDone}</div>
                        <div style={{fontSize:10,fontWeight:800,color:textMuted()}}>Best Streak</div>
                      </div>
                    </div>
                    <YearHeatmap hId={hb.id} colorIdx={hb.color_idx}/>
                  </div>
                );
              })()}
              {habits.length===0&&(
                <div style={{textAlign:'center',padding:'60px 20px',color:textMuted()}}>
                  <div style={{fontSize:48,marginBottom:12}}>🌱</div>
                  <div style={{fontSize:16,fontWeight:700}}>No habits yet!</div>
                </div>
              )}
            </div>
          )}

          {/* COUNTDOWN + FAB */}
          <div style={{position:'fixed',bottom:24,right:16,display:'flex',flexDirection:'column',alignItems:'flex-end',gap:10,zIndex:50}}>
            <div style={{background:isDark?'#252540':'#fff',borderRadius:20,padding:'8px 14px',
              boxShadow:'0 4px 16px rgba(0,0,0,0.15)',display:'flex',alignItems:'center',gap:8,
              border:`1.5px solid ${isDark?'#3a3a5c':'#ececec'}`}}>
              <span style={{fontSize:16}}>⏰</span>
              <div style={{display:'flex',flexDirection:'column'}}>
                <span style={{fontSize:9,fontWeight:800,color:textMuted(),letterSpacing:0.5}}>NEW DAY IN</span>
                <span style={{fontSize:15,fontWeight:900,color:'#4caf50',letterSpacing:1,fontFamily:'monospace'}}>{timeLeft}</span>
              </div>
            </div>
            <button type="button" onClick={()=>setModal(true)}
              style={{width:58,height:58,borderRadius:'50%',background:'linear-gradient(135deg,#4caf50,#66bb6a)',
                border:'none',color:'#fff',fontSize:30,fontWeight:700,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',
                boxShadow:'0 4px 20px rgba(76,175,80,0.55)'}}>+</button>
          </div>

          {/* ADD HABIT MODAL */}
          {modal&&(
            <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',
              display:'flex',alignItems:'flex-end',zIndex:100}}>
              <div style={{background:isDark?'#252540':'#fff',borderRadius:'28px 28px 0 0',
                padding:'20px 20px 40px',width:'100%',maxWidth:480,margin:'0 auto',maxHeight:'90vh',overflowY:'auto'}}>
                <div style={{width:40,height:4,background:isDark?'#3a3a5c':'#e0e0e0',borderRadius:4,margin:'0 auto 18px'}}/>
                <div style={{fontSize:17,fontWeight:900,color:textPrimary(),marginBottom:16,textAlign:'center'}}>✨ New Habit</div>
                <div style={{fontSize:10,fontWeight:800,color:textMuted(),letterSpacing:0.8,marginBottom:7}}>HABIT NAME</div>
                <input value={habitName} onChange={e=>setHabitName(e.target.value)}
                  placeholder="e.g. Drink water 💧" style={{...inputSt(),marginBottom:16}}/>
                <div style={{fontSize:10,fontWeight:800,color:textMuted(),letterSpacing:0.8,marginBottom:7}}>PICK AN ICON</div>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                  {customIcon?(
                    <div style={{position:'relative'}}>
                      <img src={customIcon} alt="custom" style={{width:52,height:52,borderRadius:14,objectFit:'cover',border:'2px solid #4caf50'}}/>
                      <button type="button" onClick={()=>setCustomIcon(null)}
                        style={{position:'absolute',top:-6,right:-6,width:18,height:18,borderRadius:'50%',
                          background:'#e74c3c',border:'none',color:'#fff',fontSize:10,cursor:'pointer',
                          display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900}}>✕</button>
                    </div>
                  ):(
                    <label style={{width:52,height:52,borderRadius:14,
                      border:`2px dashed ${isDark?'#3a3a5c':'#ececec'}`,
                      display:'flex',alignItems:'center',justifyContent:'center',
                      cursor:'pointer',flexDirection:'column',gap:2,background:isDark?'#1a1a2e':'#f7f8fa'}}>
                      <span style={{fontSize:20}}>📷</span>
                      <span style={{fontSize:8,fontWeight:800,color:textMuted()}}>Upload</span>
                      <input type="file" accept="image/*" onChange={handleIconUpload} style={{display:'none'}}/>
                    </label>
                  )}
                  <span style={{fontSize:11,fontWeight:700,color:textMuted()}}>
                    {customIcon?'Custom icon selected ✅':'Upload your own icon or pick below'}
                  </span>
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:16,opacity:customIcon?0.4:1}}>
                  {EMOJIS.map(e=>(
                    <button key={e} type="button" onClick={()=>{ if(!customIcon) setSelEmoji(e); }}
                      style={{width:38,height:38,borderRadius:11,fontSize:18,cursor:customIcon?'not-allowed':'pointer',
                        border:`2px solid ${!customIcon&&e===selEmoji?'#4caf50':isDark?'#3a3a5c':'#ececec'}`,
                        background:!customIcon&&e===selEmoji?'#e8f9ee':isDark?'#1a1a2e':'#f7f8fa',
                        transform:!customIcon&&e===selEmoji?'scale(1.1)':'scale(1)'}}>{e}</button>
                  ))}
                </div>
                <div style={{fontSize:10,fontWeight:800,color:textMuted(),letterSpacing:0.8,marginBottom:7}}>PICK A COLOUR</div>
                <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}}>
                  {(isDark?PALETTE_DARK:PALETTE).map((c,i)=>(
                    <div key={i} onClick={()=>setSelColor(i)}
                      style={{width:30,height:30,borderRadius:'50%',background:c.dot,cursor:'pointer',
                        border:`3px solid ${i===selColor?'#f0f0f0':'transparent'}`,
                        transform:i===selColor?'scale(1.2)':'scale(1)',transition:'all 0.15s'}}/>
                  ))}
                </div>
                <div style={{background:isDark?'#1a1a2e':'#f7f8fa',borderRadius:16,padding:'12px 14px',
                  display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
                  <div style={{width:44,height:44,borderRadius:14,background:getPal(selColor).bg,
                    overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>
                    {customIcon?<img src={customIcon} alt="p" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:selEmoji}
                  </div>
                  <div>
                    <div style={{fontSize:14,fontWeight:800,color:textPrimary()}}>{habitName||'Habit name...'}</div>
                    <div style={{fontSize:11,fontWeight:700,color:textMuted()}}>🔥 0 Days</div>
                  </div>
                </div>
                <div style={{display:'flex',gap:12}}>
                  <button type="button" onClick={()=>{setModal(false);setCustomIcon(null);}}
                    style={{flex:1,padding:14,borderRadius:14,border:`2px solid ${isDark?'#3a3a5c':'#ececec'}`,
                      background:'transparent',fontFamily:'Nunito,sans-serif',fontSize:14,fontWeight:800,
                      color:textMuted(),cursor:'pointer'}}>Cancel</button>
                  <button type="button" onClick={saveHabit}
                    style={{flex:2,padding:14,borderRadius:14,border:'none',
                      background:'linear-gradient(135deg,#4caf50,#66bb6a)',fontFamily:'Nunito,sans-serif',
                      fontSize:14,fontWeight:800,color:'#fff',cursor:'pointer'}}>Save Habit ✓</button>
                </div>
              </div>
            </div>
          )}

          {/* PROFILE MODAL */}
          {showProfile&&(
            <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',
              display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,
              padding:'0 24px',boxSizing:'border-box'}}>
              <div style={{background:isDark?'#252540':'#fff',borderRadius:24,padding:'28px 22px',
                width:'100%',maxWidth:380,textAlign:'center'}}>
                <div style={{fontSize:16,fontWeight:900,color:textPrimary(),marginBottom:14}}>👤 {userName}</div>
                <div style={{width:86,height:86,borderRadius:'50%',margin:'0 auto 12px',overflow:'hidden',
                  border:'3px solid #ffb300',display:'flex',alignItems:'center',justifyContent:'center',
                  background:'linear-gradient(135deg,#4caf50,#66bb6a)',fontSize:30,fontWeight:900,color:'#fff'}}>
                  {profilePic?<img src={profilePic} alt="p" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:getInitials(userName)}
                </div>
                <div style={{fontSize:12,fontWeight:700,color:textMuted(),marginBottom:18}}>{session.user.email}</div>
                <label style={{display:'block',width:'100%',padding:13,borderRadius:14,
                  border:'2px dashed #4caf50',background:'#f0faf0',color:'#2e7d32',
                  fontFamily:'Nunito,sans-serif',fontSize:14,fontWeight:800,
                  cursor:'pointer',marginBottom:10,boxSizing:'border-box'}}>
                  📷 Upload Photo
                  <input type="file" accept="image/*" onChange={handleFileUpload} style={{display:'none'}}/>
                </label>
                {profilePic&&(
                  <button type="button" onClick={removeProfilePic}
                    style={{display:'block',width:'100%',padding:13,borderRadius:14,background:'#fde8e8',
                      color:'#e74c3c',fontFamily:'Nunito,sans-serif',fontSize:14,fontWeight:800,
                      cursor:'pointer',border:'none',marginBottom:10}}>🗑️ Remove Photo</button>
                )}
                <button type="button" onClick={async()=>{
                  if('Notification'in window){
                    if(Notification.permission==='granted') alert('✅ Notifications are ON!\nYou will be reminded at 9:00 PM daily.');
                    else{ const p=await Notification.requestPermission();
                      if(p==='granted') alert('✅ Notifications enabled!');
                      else alert('❌ Notifications blocked. Please enable in browser settings.');}
                  }
                }}
                  style={{display:'block',width:'100%',padding:13,borderRadius:14,
                    background:isDark?'#1a3a2e':'#e8f9ee',color:'#2e9e50',
                    fontFamily:'Nunito,sans-serif',fontSize:14,fontWeight:800,
                    cursor:'pointer',border:'2px solid #2e9e50',marginBottom:10}}>
                  🔔 {typeof Notification!=='undefined'&&Notification.permission==='granted'?'Notifications ON ✅':'Enable Notifications'}
                </button>
                <button type="button" onClick={doLogout}
                  style={{display:'block',width:'100%',padding:13,borderRadius:14,background:'#fff3e0',
                    color:'#e67e22',fontFamily:'Nunito,sans-serif',fontSize:14,fontWeight:800,
                    cursor:'pointer',border:'none',marginBottom:10}}>🚪 Logout</button>
                <button type="button" onClick={()=>setShowProfile(false)}
                  style={{display:'block',width:'100%',padding:13,borderRadius:14,background:'transparent',
                    color:textMuted(),fontFamily:'Nunito,sans-serif',fontSize:14,fontWeight:800,
                    cursor:'pointer',border:`2px solid ${isDark?'#3a3a5c':'#ececec'}`}}>Close</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
