'use client';

/**
 * Tela da TV da sala de espera. Abre pelo link que o administrador gera em
 * Configurações → Chamada na TV, sem login. Pergunta ao servidor a cada
 * 2,5 s se há chamada nova; quando há, destaca, toca um aviso e fala o
 * nome (ou a senha) e o local, se a TV tiver voz.
 *
 * O navegador só deixa tocar som depois de um toque na tela: por isso a
 * primeira abertura pede "toque para ativar o som".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Volume2 } from 'lucide-react';

type Chamada = { id: string; senha: number | null; nome_exibicao: string | null; local: string | null; created_at: string };
type Resposta = { clinica: string; voz: boolean; chamadas: Chamada[]; agora: string };

const INTERVALO_MS = 2500;
const CHAVE_SOM = 'ortus:tv:som';

function texto(c: Chamada) {
  if (c.nome_exibicao) return c.nome_exibicao;
  if (c.senha) return `Senha ${String(c.senha).padStart(3, '0')}`;
  return 'Paciente';
}

function falado(c: Chamada) {
  const quem = c.nome_exibicao ? c.nome_exibicao.replace(/\b([A-ZÀ-Ý])\.$/, '$1') : c.senha ? `senha ${c.senha}` : 'próximo paciente';
  return c.local ? `${quem}, ${c.local}.` : `${quem}.`;
}

export default function TelaTv() {
  const params = useParams();
  const token = typeof params.token === 'string' ? params.token : '';
  const [clinica, setClinica] = useState('');
  const [chamadas, setChamadas] = useState<Chamada[]>([]);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'invalido' | 'sem-conexao'>('carregando');
  const [somLiberado, setSomLiberado] = useState(false);
  const [destaque, setDestaque] = useState(false);
  const [hora, setHora] = useState('');
  const ultima = useRef<string | null>(null);
  const vistos = useRef(new Set<string>());
  const primeira = useRef(true);
  const voz = useRef(true);
  const audio = useRef<AudioContext | null>(null);
  const somRef = useRef(false);

  useEffect(() => {
    try { if (sessionStorage.getItem(CHAVE_SOM) === '1') setSomLiberado(true); } catch { /* sem armazenamento: pede o toque */ }
    const relogio = () => setHora(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    relogio();
    const t = window.setInterval(relogio, 10_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => { somRef.current = somLiberado; }, [somLiberado]);

  const tocar = useCallback((c: Chamada) => {
    if (!somRef.current) return;
    try {
      const ctx = audio.current ?? new AudioContext();
      audio.current = ctx;
      const agora = ctx.currentTime;
      [880, 660].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        ganho.gain.setValueAtTime(0.0001, agora + i * 0.35);
        ganho.gain.exponentialRampToValueAtTime(0.4, agora + i * 0.35 + 0.03);
        ganho.gain.exponentialRampToValueAtTime(0.0001, agora + i * 0.35 + 0.32);
        osc.connect(ganho).connect(ctx.destination);
        osc.start(agora + i * 0.35);
        osc.stop(agora + i * 0.35 + 0.34);
      });
    } catch { /* TV sem áudio */ }
    if (voz.current && 'speechSynthesis' in window) {
      window.setTimeout(() => {
        try {
          const fala = new SpeechSynthesisUtterance(falado(c));
          fala.lang = 'pt-BR';
          fala.rate = 0.95;
          const vozPt = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt'));
          if (vozPt) fala.voice = vozPt;
          window.speechSynthesis.speak(fala);
        } catch { /* TV sem voz: fica o toque */ }
      }, 800);
    }
  }, []);

  useEffect(() => {
    if (!token) { setEstado('invalido'); return; }
    let vivo = true;
    async function ciclo() {
      try {
        const url = `/api/public/tv/${encodeURIComponent(token)}${ultima.current ? `?depois=${encodeURIComponent(ultima.current)}` : ''}`;
        const r = await fetch(url, { cache: 'no-store' });
        if (!vivo) return;
        if (r.status === 404) { setEstado('invalido'); return; }
        if (!r.ok) { setEstado((e) => (e === 'carregando' ? 'carregando' : 'sem-conexao')); return; }
        const d = (await r.json()) as Resposta;
        setClinica(d.clinica);
        voz.current = d.voz;
        setEstado('ok');
        const novas = d.chamadas.filter((c) => !vistos.current.has(c.id));
        if (novas.length === 0) return;
        novas.forEach((c) => vistos.current.add(c.id));
        ultima.current = novas[novas.length - 1].created_at;
        setChamadas((atual) => [...atual, ...novas].slice(-8));
        if (!primeira.current) {
          setDestaque(true);
          window.setTimeout(() => setDestaque(false), 6000);
          tocar(novas[novas.length - 1]);
        }
      } catch {
        if (vivo) setEstado((e) => (e === 'carregando' ? 'carregando' : 'sem-conexao'));
      } finally {
        primeira.current = false;
      }
    }
    void ciclo();
    const timer = window.setInterval(() => void ciclo(), INTERVALO_MS);
    return () => { vivo = false; window.clearInterval(timer); };
  }, [token, tocar]);

  function liberarSom() {
    try {
      const ctx = audio.current ?? new AudioContext();
      audio.current = ctx;
      void ctx.resume();
      if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
      sessionStorage.setItem(CHAVE_SOM, '1');
    } catch { /* segue sem som */ }
    setSomLiberado(true);
  }

  const atual = chamadas[chamadas.length - 1] || null;
  const anteriores = chamadas.slice(0, -1).reverse().slice(0, 5);

  if (estado === 'invalido') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-neutral-950 p-8 text-center font-poppins text-white">
        <div>
          <p className="text-3xl font-semibold">Este link de TV não vale mais.</p>
          <p className="mt-3 text-lg text-white/60">Peça um link novo ao administrador da clínica (Configurações → Chamada na TV).</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-dvh flex-col bg-neutral-950 font-poppins text-white" onClick={somLiberado ? undefined : liberarSom}>
      <header className="flex items-center justify-between px-[4vw] py-[3vh]">
        <p className="truncate text-[2.2vw] font-semibold text-white/80">{clinica}</p>
        <div className="flex items-center gap-4">
          {!somLiberado && (
            <button type="button" onClick={liberarSom} className="flex items-center gap-2 rounded-full bg-white px-[1.4vw] py-[0.8vh] text-[1.3vw] font-semibold text-neutral-950">
              <Volume2 className="size-[1.5vw]" /> Toque para ativar o som
            </button>
          )}
          {estado === 'sem-conexao' && <span className="rounded-full bg-amber-400/20 px-3 py-1 text-[1.1vw] text-amber-300">sem conexão</span>}
          <p className="text-[2.2vw] tabular-nums text-white/70">{hora}</p>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center px-[4vw] text-center">
        {atual ? (
          <div className={`w-full rounded-[3vw] px-[4vw] py-[5vh] transition-colors duration-500 ${destaque ? 'bg-[#c8f053] text-neutral-950' : 'bg-white/5'}`}>
            <p className={`text-[2vw] font-medium uppercase tracking-[0.2em] ${destaque ? 'text-neutral-900/70' : 'text-white/50'}`}>Chamando</p>
            <p className="mt-[2vh] break-words text-[9vw] font-semibold leading-none">{texto(atual)}</p>
            {atual.local && <p className={`mt-[3vh] text-[4.5vw] font-medium ${destaque ? 'text-neutral-900' : 'text-[#c8f053]'}`}>{atual.local}</p>}
          </div>
        ) : (
          <p className="text-[3vw] text-white/40">{estado === 'carregando' ? 'Carregando…' : 'Aguardando a próxima chamada'}</p>
        )}
      </section>

      {anteriores.length > 0 && (
        <footer className="px-[4vw] pb-[4vh]">
          <p className="mb-[1.5vh] text-[1.4vw] font-medium uppercase tracking-[0.15em] text-white/40">Últimas chamadas</p>
          <ul className="grid grid-cols-5 gap-[1.5vw]">
            {anteriores.map((c) => (
              <li key={c.id} className="rounded-[1.2vw] bg-white/5 px-[1.5vw] py-[1.5vh]">
                <p className="truncate text-[1.9vw] font-semibold">{texto(c)}</p>
                <p className="truncate text-[1.4vw] text-white/50">{c.local || ''}</p>
              </li>
            ))}
          </ul>
        </footer>
      )}

    </main>
  );
}
