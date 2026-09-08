/* İşlem Yok — kalıcı durum (Neon PostgreSQL)
   Sinyaller ve koşu kayıtları burada tutulur. Silme yok: kapanan sinyal
   silinmez, state alanı güncellenir. Geriye dönük düzeltme yapılmaz. */
'use strict';
const {neon}=require('@neondatabase/serverless');

const URL_=process.env.DATABASE_URL||'';
const sql=URL_?neon(URL_):null;
const enabled=!!sql;

async function ensureSchema(){
  if(!enabled)return false;
  await sql`create table if not exists signals(
    id            text primary key,
    sym           text not null,
    disp          text not null,
    tf            text not null,
    side          smallint not null,
    entry         double precision not null,
    sl            double precision not null,
    tp1           double precision,
    tp2           double precision not null,
    rm            double precision not null,
    d_stop        double precision not null,
    ev            double precision,
    se            double precision,
    fam_hi        double precision,
    t0            bigint not null,
    t_end         bigint not null,
    published_at  timestamptz not null default now(),
    state         text not null default 'open',
    half          boolean not null default false,
    closed_at     bigint,
    close_px      double precision,
    r_realized    double precision,
    msg_id        bigint
  )`;
  await sql`create index if not exists signals_open_idx on signals(state) where state='open'`;
  await sql`create table if not exists runs(
    id         bigserial primary key,
    ran_at     timestamptz not null default now(),
    tf         text not null,
    cores      int, combos int,
    fam_hi     double precision,
    new_sigs   int not null default 0,
    closed     int not null default 0,
    best_disp  text, best_ev double precision
  )`;
  return true;
}

const openSignals=async()=>enabled
  ? sql`select * from signals where state='open' order by published_at`
  : [];

const openFor=async(sym,tf)=>{
  if(!enabled)return null;
  const r=await sql`select * from signals
    where sym=${sym} and tf=${tf} and state='open' limit 1`;
  return r[0]||null;
};

async function insertSignal(s){
  if(!enabled)return;
  await sql`insert into signals
    (id,sym,disp,tf,side,entry,sl,tp1,tp2,rm,d_stop,ev,se,fam_hi,t0,t_end,msg_id)
    values(${s.id},${s.sym},${s.disp},${s.tf},${s.side},${s.entry},${s.sl},${s.tp1},
           ${s.tp2},${s.rm},${s.d_stop},${s.ev},${s.se},${s.fam_hi},${s.t0},${s.t_end},${s.msg_id||null})
    on conflict (id) do nothing`;
}

async function closeSignal(id,state,closedAt,px,R,half){
  if(!enabled)return;
  await sql`update signals set state=${state},closed_at=${closedAt},
    close_px=${px},r_realized=${R},half=${!!half} where id=${id}`;
}

const markHalf=async id=>{ if(enabled)await sql`update signals set half=true where id=${id}`; };

async function logRun(r){
  if(!enabled)return;
  await sql`insert into runs(tf,cores,combos,fam_hi,new_sigs,closed,best_disp,best_ev)
    values(${r.tf},${r.cores},${r.combos},${r.famHi},${r.newSigs},${r.closed},
           ${r.bestDisp||null},${isFinite(r.bestEv)?r.bestEv:null})`;
}

/* kaç koşudur yeni sinyal çıkmadı */
async function silentStreak(){
  if(!enabled)return 0;
  const r=await sql`select new_sigs from runs order by ran_at desc limit 60`;
  let n=0;for(const x of r){if(x.new_sigs>0)break;n++;}
  return n;
}

/* kamuya açık dışa aktarım için son N kayıt */
const recentSignals=async(n=200)=>enabled
  ? sql`select * from signals order by published_at desc limit ${n}`
  : [];

const runStats=async()=>{
  if(!enabled)return null;
  const r=await sql`select count(*)::int total,
    coalesce(sum(new_sigs),0)::int sigs,
    min(ran_at) first_run from runs`;
  return r[0]||null;
};

module.exports={enabled,ensureSchema,openSignals,openFor,insertSignal,
  closeSignal,markHalf,logRun,silentStreak,recentSignals,runStats};
