// 🧾 Modal "Nota fiscal" do Histórico de Vendas (NF-e própria, direto na SEFAZ, sem Tiny).
// FASE 1: só "Emitir teste (homologação)". Cliente e itens vêm da venda e podem ser editados antes de emitir;
// cidade, UF e código IBGE saem do CEP (ViaCEP). Em homologação o nome do cliente e do 1º item viram o texto da SEFAZ.
import { useEffect, useMemo, useState } from 'react';
import { X, FileText, Download, RefreshCw, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  NfeDest, NfeItem, NfeNota, NfeCert, HOMOLOG_DEST, HOMOLOG_ITEM,
  nfeGet, nfePost, cepComIbge, rascunhoDaVenda, baixarDanfe, baixarXml, numBR,
} from '../lib/nfeApi';
import { AVISO_FORA_RJ, foraDoRj, itensSemNcm, podeEmitirUf } from '../lib/nfeRegras';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Venda = Record<string, any>;
interface Props { sale: Venda; onClose: () => void }
type Resultado =
  | { tipo: 'autorizada'; id: string; numero: number; serie?: number; chave?: string; protocolo?: string }
  | { tipo: 'pendente'; id: string; msg: string }
  | { tipo: 'rejeitada'; cstat?: string; motivo?: string; dica?: string | null; msg: string }
  | { tipo: 'erro'; msg: string; semNcm?: string[] };

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const inp = 'w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm';
const lbl = 'block text-xs font-medium text-gray-400 mb-1';

export default function NfeModal({ sale, onClose }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [dest, setDest] = useState<NfeDest | null>(null);
  const [itens, setItens] = useState<NfeItem[]>([]);
  const [desconto, setDesconto] = useState('0');
  const [frete, setFrete] = useState('0');
  const [totalVenda, setTotalVenda] = useState(0);
  const [cert, setCert] = useState<NfeCert | null>(null);
  const [existente, setExistente] = useState<NfeNota | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [baixando, setBaixando] = useState('');
  const [erroBaixar, setErroBaixar] = useState('');
  const [conferiuUf, setConferiuUf] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [r, v] = await Promise.all([rascunhoDaVenda(sale), nfeGet({ op: 'venda', id: sale.id }).catch((e: Error) => ({ erro: e.message }))]);
        if (!vivo) return;
        setDest(r.dest);
        setItens(r.itens);
        setDesconto(String(r.desconto).replace('.', ','));
        setFrete(String(r.frete).replace('.', ','));
        setTotalVenda(r.total);
        if (v.erro) setErroCarga(v.erro);
        setCert(v.cert || null);
        const ativa = (v.notas || []).find((n: NfeNota) => n.ambiente === 2 && ['autorizada', 'pendente', 'emitindo'].includes(n.status)) || null;
        setExistente(ativa);
        if (ativa?.status === 'autorizada') setRes({ tipo: 'autorizada', id: ativa.id, numero: ativa.numero, serie: ativa.serie, chave: ativa.chave || undefined, protocolo: ativa.protocolo || undefined });
        else if (ativa) setRes({ tipo: 'pendente', id: ativa.id, msg: `A nota de teste nº ${ativa.numero} ficou sem resposta da SEFAZ. Consulte antes de emitir de novo.` });
      } catch (e) {
        if (vivo) setErroCarga(e instanceof Error ? e.message : 'não consegui carregar a venda');
      } finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [sale]);

  const setD = (k: keyof NfeDest, v: string) => setDest((d) => (d ? { ...d, [k]: v } : d));
  // trocou a UF (digitando ou pelo CEP): precisa conferir de novo
  const ufAtual = dest?.uf || '';
  useEffect(() => { setConferiuUf(false); }, [ufAtual]);
  const setI = (k: number, campo: keyof NfeItem, v: string) => setItens((l) => l.map((x, j) => (j === k ? { ...x, [campo]: v } : x)));
  const buscarCep = async (cep: string) => {
    if (dig(cep).length !== 8) return;
    setBuscandoCep(true);
    const c = await cepComIbge(cep);
    setBuscandoCep(false);
    if (!c) { setRes({ tipo: 'erro', msg: 'CEP não encontrado no ViaCEP: confira o número.' }); return; }
    setDest((d) => (d ? { ...d, cep: dig(cep), municipio: c.municipio, uf: c.uf, cod_municipio: c.cod_municipio, endereco: d.endereco || c.endereco, bairro: d.bairro || c.bairro } : d));
  };

  const totais = useMemo(() => {
    const prod = r2(itens.reduce((s, i) => s + numBR(i.qtd) * numBR(i.valor), 0));
    const desc = r2(numBR(desconto)), fr = r2(numBR(frete));
    return { prod, desc, fr, nota: r2(prod - desc + fr) };
  }, [itens, desconto, frete]);
  const semNcm = itensSemNcm(itens);
  const ufLiberada = podeEmitirUf(dest?.uf, conferiuUf);
  const travado = !!(existente && ['autorizada', 'pendente', 'emitindo'].includes(existente.status)) || res?.tipo === 'autorizada' || res?.tipo === 'pendente';

  const emitir = async () => {
    if (!dest || !ufLiberada) return;
    if (semNcm.length) { setRes({ tipo: 'erro', msg: `Item sem NCM: ${semNcm.join(', ')}. Cadastre o NCM em Produtos ou Acessórios (ou digite aqui) antes de emitir.`, semNcm }); return; }
    setEnviando(true); setRes(null);
    try {
      const j = await nfePost({
        op: 'emitir', ambiente: 2, venda_id: sale.id, dest,
        itens: itens.map((i) => ({ ...i, qtd: numBR(i.qtd), valor: numBR(i.valor) })),
        desconto: totais.desc, frete: totais.fr,
      });
      if (j.ok) setRes({ tipo: 'autorizada', id: j.id, numero: j.numero, serie: j.serie, chave: j.chave, protocolo: j.protocolo });
      else if (j.pendente) setRes({ tipo: 'pendente', id: j.id, msg: j.erro });
      else if (j.rejeitada) setRes({ tipo: 'rejeitada', cstat: j.cstat, motivo: j.motivo, dica: j.dica, msg: j.erro });
      else if (j.id && j.status) {
        setRes(j.status === 'autorizada' ? { tipo: 'autorizada', id: j.id, numero: 0 } : { tipo: 'pendente', id: j.id, msg: j.erro });
      } else setRes({ tipo: 'erro', msg: j.erro || 'erro desconhecido', semNcm: j.sem_ncm });
    } catch (e) { setRes({ tipo: 'erro', msg: e instanceof Error ? e.message : 'falhou' }); }
    setEnviando(false);
  };

  const consultar = async (id: string) => {
    setEnviando(true);
    try {
      const j = await nfePost({ op: 'consultar', id });
      if (j.erro) setRes({ tipo: 'pendente', id, msg: j.erro });
      else if (j.status === 'autorizada') { setRes({ tipo: 'autorizada', id, numero: j.numero, chave: j.chave, protocolo: j.protocolo }); setExistente(null); }
      else if (j.status === 'rejeitada') { setRes({ tipo: 'rejeitada', msg: j.motivo || 'a nota não chegou na SEFAZ; pode emitir de novo' }); setExistente(null); }
      else setRes({ tipo: 'pendente', id, msg: `Ainda sem resultado na SEFAZ${j.cstat ? ` (${j.cstat}: ${j.motivo})` : ''}. Tente de novo em alguns minutos.` });
    } catch (e) { setRes({ tipo: 'pendente', id, msg: e instanceof Error ? e.message : 'falhou' }); }
    setEnviando(false);
  };

  const baixar = async (tipo: 'pdf' | 'xml', id: string) => {
    setBaixando(tipo); setErroBaixar('');
    try { if (tipo === 'pdf') await baixarDanfe(id); else await baixarXml(id); } catch (e) { setErroBaixar(e instanceof Error ? e.message : 'falhou'); }
    setBaixando('');
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto border border-gray-700 text-white" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Nota fiscal">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 sticky top-0 bg-gray-800 z-10">
          <div className="flex items-center gap-3">
            <FileText className="text-yellow-500" size={22} />
            <div>
              <h2 className="text-lg font-bold">Nota fiscal (NF-e)</h2>
              <p className="text-xs text-gray-400">Venda de {String(sale.customer_name || '')} · {brl(Number(sale.total_sale_price) || 0)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-700" aria-label="Fechar"><X size={20} /></button>
        </div>

        <div className="px-6 py-4 space-y-5">
          <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            🧪 <b>Ambiente de teste (homologação)</b>: a nota vai para a SEFAZ (SVRS) só para teste, <b>sem valor fiscal</b>. Série 2.
            {cert && (cert.ok
              ? <span className="block text-xs text-yellow-100/80 mt-1">Certificado OK até {cert.validade?.split('-').reverse().join('/')} ({cert.dias} dias).</span>
              : <span className="block text-xs text-red-300 mt-1">⚠️ {cert.erro}</span>)}
          </div>

          {carregando && <div className="flex items-center gap-2 text-gray-400 text-sm"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500" />Carregando a venda…</div>}
          {erroCarga && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{erroCarga}</div>}

          {dest && (
            <>
              <section>
                <h3 className="text-sm font-bold text-orange-400 mb-2">Cliente</h3>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 md:col-span-8">
                    <label className={lbl}>Nome (em teste a SEFAZ exige este texto)</label>
                    <input className={`${inp} opacity-80`} value={HOMOLOG_DEST} readOnly title="Em homologação o nome é trocado pelo texto exigido pela SEFAZ" />
                    {dest.nome && <p className="text-xs text-gray-500 mt-1">Nome real: {dest.nome} (vai na nota de produção)</p>}
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <label className={lbl}>CPF / CNPJ</label>
                    <input className={inp} value={dest.doc} onChange={(e) => setD('doc', e.target.value)} inputMode="numeric" placeholder="000.000.000-00" />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className={lbl}>CEP {buscandoCep && <span className="text-orange-400">buscando…</span>}</label>
                    <input className={inp} value={dest.cep} inputMode="numeric" placeholder="00000-000"
                      onChange={(e) => { setD('cep', e.target.value); if (dig(e.target.value).length === 8) buscarCep(e.target.value); }} />
                  </div>
                  <div className="col-span-12 md:col-span-6">
                    <label className={lbl}>Rua</label>
                    <input className={inp} value={dest.endereco} onChange={(e) => setD('endereco', e.target.value)} />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className={lbl}>Número</label>
                    <input className={inp} value={dest.numero} onChange={(e) => setD('numero', e.target.value)} placeholder="S/N" />
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <label className={lbl}>Complemento</label>
                    <input className={inp} value={dest.complemento} onChange={(e) => setD('complemento', e.target.value)} />
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <label className={lbl}>Bairro</label>
                    <input className={inp} value={dest.bairro} onChange={(e) => setD('bairro', e.target.value)} />
                  </div>
                  <div className="col-span-6 md:col-span-4">
                    <label className={lbl}>Telefone (opcional)</label>
                    <input className={inp} value={dest.fone} onChange={(e) => setD('fone', e.target.value)} inputMode="numeric" />
                  </div>
                  <div className="col-span-12 md:col-span-5">
                    <label className={lbl}>Cidade (pelo CEP)</label>
                    <input className={inp} value={dest.municipio} onChange={(e) => setD('municipio', e.target.value)} />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <label className={lbl}>UF</label>
                    <input className={inp} value={dest.uf} maxLength={2} onChange={(e) => setD('uf', e.target.value.toUpperCase())} />
                  </div>
                  <div className="col-span-8 md:col-span-2">
                    <label className={lbl}>Cód. IBGE</label>
                    <input className={`${inp} ${/^\d{7}$/.test(dest.cod_municipio) ? '' : 'border-red-500'}`} value={dest.cod_municipio} inputMode="numeric" onChange={(e) => setD('cod_municipio', e.target.value)} />
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <label className={lbl}>E-mail (opcional)</label>
                    <input className={inp} value={dest.email} onChange={(e) => setD('email', e.target.value)} />
                  </div>
                </div>
                {!/^\d{7}$/.test(dest.cod_municipio) && <p className="text-xs text-red-400 mt-1">Digite o CEP para achar a cidade e o código IBGE.</p>}
                {foraDoRj(dest.uf) && (
                  <div className="mt-2 rounded-lg border border-yellow-500/60 bg-yellow-500/15 px-3 py-2 text-sm text-yellow-200" role="alert">
                    <p className="flex items-center gap-2"><AlertTriangle size={15} className="shrink-0" />{AVISO_FORA_RJ}</p>
                    <label className="flex items-center gap-2 mt-2 text-yellow-100 cursor-pointer select-none">
                      <input type="checkbox" checked={conferiuUf} onChange={(e) => setConferiuUf(e.target.checked)} className="accent-yellow-500 h-4 w-4" />
                      Conferi
                    </label>
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-sm font-bold text-orange-400 mb-2">Itens <span className="text-gray-500 font-normal text-xs">brinde entra com valor 0,00 · o NCM vem do cadastro de Produtos (brinde: de Acessórios)</span></h3>
                <div className="space-y-2">
                  {itens.map((i, k) => {
                    const ncmOk = /^\d{8}$/.test(dig(i.ncm));
                    return (
                      <div key={k} className="grid grid-cols-12 gap-2 items-end bg-gray-900/40 rounded-lg p-2">
                        <div className="col-span-12 md:col-span-6">
                          <label className={lbl}>{k === 0 ? 'Nome (1º item em teste: texto da SEFAZ)' : `Nome${i.brinde ? ' (brinde)' : ''}`}</label>
                          {k === 0
                            ? <input className={`${inp} opacity-80`} value={HOMOLOG_ITEM} readOnly title="Em homologação o 1º item sai com o texto exigido pela SEFAZ" />
                            : <input className={inp} value={i.nome} onChange={(e) => setI(k, 'nome', e.target.value)} />}
                          {k === 0 && <p className="text-xs text-gray-500 mt-0.5">Produto: {i.nome}</p>}
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <label className={lbl}>NCM</label>
                          <input className={`${inp} ${ncmOk ? '' : 'border-red-500'}`} value={i.ncm} inputMode="numeric" maxLength={10} placeholder="8 números" onChange={(e) => setI(k, 'ncm', e.target.value)} />
                        </div>
                        <div className="col-span-3 md:col-span-1">
                          <label className={lbl}>Qtd</label>
                          <input className={inp} value={String(i.qtd)} inputMode="decimal" onChange={(e) => setI(k, 'qtd', e.target.value)} />
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <label className={lbl}>Valor un. (R$)</label>
                          <input className={inp} value={String(i.valor).replace('.', ',')} inputMode="decimal" onChange={(e) => setI(k, 'valor', e.target.value)} />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          {itens.length > 1 && <button type="button" onClick={() => setItens((l) => l.filter((_, j) => j !== k))} className="p-2 text-gray-400 hover:text-red-400" title="Tirar item da nota"><Trash2 size={16} /></button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {semNcm.length > 0 && <p className="text-xs text-red-400 mt-2">Sem NCM: {semNcm.join(', ')}. A nota não sai enquanto faltar NCM.</p>}
                <div className="grid grid-cols-12 gap-3 mt-3">
                  <div className="col-span-6 md:col-span-3">
                    <label className={lbl}>Desconto (R$)</label>
                    <input className={inp} value={desconto} inputMode="decimal" onChange={(e) => setDesconto(e.target.value)} />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className={lbl}>Frete (R$)</label>
                    <input className={inp} value={frete} inputMode="decimal" onChange={(e) => setFrete(e.target.value)} />
                  </div>
                  <div className="col-span-12 md:col-span-6 flex flex-col items-end justify-end text-sm">
                    <span className="text-gray-400">Produtos {brl(totais.prod)}{totais.desc ? ` − desconto ${brl(totais.desc)}` : ''}{totais.fr ? ` + frete ${brl(totais.fr)}` : ''}</span>
                    <span className="text-lg font-bold">Total da nota: {brl(totais.nota)}</span>
                    {Math.abs(totais.nota - totalVenda) > 0.009 && <span className="text-xs text-yellow-400">diferente do total da venda ({brl(totalVenda)})</span>}
                  </div>
                </div>
              </section>
            </>
          )}

          {res?.tipo === 'rejeitada' && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm" role="alert">
              <p className="font-bold text-red-300 flex items-center gap-2"><AlertTriangle size={16} />Rejeitada pela SEFAZ{res.cstat ? ` — código ${res.cstat}` : ''}</p>
              <p className="text-red-200 mt-1">{res.motivo || res.msg}</p>
              {res.dica && <p className="text-red-100/80 mt-1 text-xs">O que fazer: {res.dica}</p>}
              <p className="text-xs text-gray-400 mt-1">O número voltou e pode ser usado de novo. Corrija e emita outra vez.</p>
            </div>
          )}
          {res?.tipo === 'erro' && <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">{res.msg}</div>}
          {res?.tipo === 'pendente' && (
            <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 px-4 py-3 text-sm" role="status">
              <p className="text-yellow-200">{res.msg}</p>
              <button type="button" disabled={enviando} onClick={() => consultar(res.id)} className="mt-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 px-4 py-2 rounded-lg font-semibold flex items-center gap-2">
                <RefreshCw size={15} className={enviando ? 'animate-spin' : ''} />Consultar SEFAZ
              </button>
            </div>
          )}
          {res?.tipo === 'autorizada' && (
            <div className="rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm" role="status">
              <p className="font-bold text-green-300 flex items-center gap-2"><CheckCircle2 size={16} />Nota de teste autorizada{res.numero ? ` — nº ${res.numero}` : ''}{res.serie ? `, série ${res.serie}` : ''}</p>
              {res.protocolo && <p className="text-xs text-green-100/80 mt-1">Protocolo {res.protocolo}{res.chave ? ` · chave ${res.chave}` : ''}</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" disabled={!!baixando} onClick={() => baixar('pdf', res.id)} className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-4 py-2 rounded-lg font-semibold flex items-center gap-2"><Download size={15} />{baixando === 'pdf' ? 'Gerando…' : 'Baixar DANFE (PDF)'}</button>
                <button type="button" disabled={!!baixando} onClick={() => baixar('xml', res.id)} className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 px-4 py-2 rounded-lg font-semibold flex items-center gap-2"><Download size={15} />{baixando === 'xml' ? 'Baixando…' : 'Baixar XML'}</button>
              </div>
              {erroBaixar && <p className="text-xs text-red-300 mt-2">{erroBaixar}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-700 sticky bottom-0 bg-gray-800">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700">Fechar</button>
          {!travado && (
            <button type="button" disabled={enviando || carregando || !dest || !ufLiberada || (cert ? !cert.ok : false)} onClick={emitir}
              title={ufLiberada ? undefined : 'Marque "Conferi" no aviso de cliente fora do RJ'}
              className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-5 py-2 rounded-lg font-semibold flex items-center gap-2">
              {enviando ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Enviando para a SEFAZ…</> : <>🧪 Emitir teste (homologação)</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
