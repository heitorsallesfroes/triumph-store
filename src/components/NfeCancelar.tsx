// ⛔ "Cancelar nota" (evento 110111 na SEFAZ), usado no modal da venda e na lista de Notas fiscais.
// Só nota autorizada, até 24 h depois da autorização (o servidor confere de novo), justificativa de 15 a 255 letras
// e um segundo clique de confirmação. Vai para o ambiente da própria nota (teste ou real).
import { useState } from 'react';
import { Ban, AlertTriangle } from 'lucide-react';
import { cancelarNota } from '../lib/nfeApi';
import { JUST_MAX, JUST_MIN, prazoCancelamento, restanteTexto } from '../lib/nfeRegras';

interface Nota { id: string; numero: number; serie?: number; ambiente: number; status: string; autorizada_em?: string | null; cliente?: string | null }
interface Props { nota: Nota; onFeito: (msg: string) => void; onFechar?: () => void; aberto?: boolean }

const limpa = (s: string) => s.replace(/\s+/g, ' ').trim();

// botão + painel: o painel abre ao clicar (ou já aberto, se aberto=true)
export default function NfeCancelar({ nota, onFeito, onFechar, aberto = false }: Props) {
  const [abrir, setAbrir] = useState(aberto);
  const [just, setJust] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const pz = prazoCancelamento(nota);
  const tam = limpa(just).length;
  const fechar = () => { setAbrir(false); setConfirmando(false); setErro(''); onFechar?.(); };

  if (nota.status !== 'autorizada') return null;
  if (!pz.pode) return <span className="text-xs text-gray-500" title="A SEFAZ só aceita cancelamento até 24 h depois da autorização">Cancelar: passou do prazo de 24 h</span>;
  if (!abrir) {
    return (
      <button type="button" onClick={() => setAbrir(true)} className="border border-red-500/60 text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
        <Ban size={13} />Cancelar nota
      </button>
    );
  }
  const enviar = async () => {
    setEnviando(true); setErro('');
    try {
      const j = await cancelarNota(nota.id, limpa(just));
      if (j.ok) { onFeito(`⛔ Nota nº ${nota.numero}${nota.ambiente === 2 ? ' (teste)' : ''} cancelada na SEFAZ${j.protocolo ? ` — protocolo ${j.protocolo}` : ''}.`); fechar(); }
      else { setErro(`${j.erro || 'a SEFAZ não cancelou'}${j.dica ? ` O que fazer: ${j.dica}` : ''}`); setConfirmando(false); }
    } catch (e) { setErro(e instanceof Error ? e.message : 'falhou'); setConfirmando(false); }
    setEnviando(false);
  };
  return (
    <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-left space-y-2 w-full" role="group" aria-label={`Cancelar a nota ${nota.numero}`}>
      <p className="font-semibold text-red-200">Cancelar a nota nº {nota.numero}{nota.ambiente === 2 ? ' (teste)' : ''}{nota.cliente ? ` de ${nota.cliente}` : ''}</p>
      <p className="text-xs text-red-100/80">Ainda dá para cancelar por {restanteTexto(pz.restanteMs)} (a SEFAZ aceita até 24 h depois da autorização). O cancelamento não tem volta.</p>
      <label className="block text-xs text-gray-300">Justificativa (mínimo {JUST_MIN} letras)
        <textarea value={just} onChange={(e) => { setJust(e.target.value.slice(0, JUST_MAX)); setConfirmando(false); }} rows={2} maxLength={JUST_MAX}
          className="mt-1 w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-red-400 focus:outline-none text-sm" placeholder="Ex.: Venda desfeita a pedido do cliente" />
      </label>
      <p className={`text-xs ${tam < JUST_MIN ? 'text-yellow-300' : 'text-gray-400'}`}>{tam}/{JUST_MAX}{tam < JUST_MIN ? ` · faltam ${JUST_MIN - tam}` : ''}</p>
      {erro && <p className="text-xs text-red-300 flex items-start gap-1" role="alert"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{erro}</p>}
      <div className="flex flex-wrap gap-2">
        {!confirmando
          ? <button type="button" disabled={tam < JUST_MIN} onClick={() => setConfirmando(true)} className="bg-red-700 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg text-xs font-semibold">Cancelar nota</button>
          : <button type="button" disabled={enviando} onClick={enviar} className="bg-red-600 hover:bg-red-500 disabled:bg-gray-600 px-3 py-1.5 rounded-lg text-xs font-bold">{enviando ? 'Cancelando na SEFAZ…' : `Confirmar: cancelar a nota nº ${nota.numero}`}</button>}
        <button type="button" disabled={enviando} onClick={fechar} className="px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 text-xs">Voltar</button>
      </div>
    </div>
  );
}
