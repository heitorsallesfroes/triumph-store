// 🧾 Modal "Nota fiscal" do Histórico de Vendas (NF-e própria, direto na SEFAZ, sem Tiny).
// Notas reais desligadas (padrão): só "Emitir teste (homologação)". Ligadas em Notas fiscais › Emitente e numeração:
// botão principal "Autorizar na SEFAZ" (produção, nome real do cliente e dos produtos, com confirmação) e o link
// pequeno "Emitir só um teste (homologação)". O servidor confere a chave no banco de novo.
// Cliente e itens vêm da venda e podem ser editados; cidade, UF e código IBGE saem do CEP (ViaCEP).
// Em homologação o servidor troca o nome do cliente e do 1º item pelo texto exigido pela SEFAZ.
// "Notas desta venda": DANFE, XML, XML do cancelamento, Consultar SEFAZ e Cancelar nota (até 24 h).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, FileText, Download, RefreshCw, Trash2, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import {
  NfeDest, NfeItem, NfeNota, NfeCert, HOMOLOG_DEST, HOMOLOG_ITEM, STATUS_NFE,
  nfeGet, nfePost, cepComIbge, rascunhoDaVenda, baixarDanfe, baixarXml, baixarXmlCancelamento, numBR,
} from '../lib/nfeApi';
import { AVISO_FORA_RJ, foraDoRj, itensSemNcm, podeEmitirUf, temNotaTiny } from '../lib/nfeRegras';
import NfeCancelar from './NfeCancelar';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Venda = Record<string, any>;
interface Props { sale: Venda; onClose: () => void }
type Resultado =
  | { tipo: 'autorizada'; numero: number; serie?: number; chave?: string; protocolo?: string; ambiente: number }
  | { tipo: 'pendente'; id: string; msg: string }
  | { tipo: 'rejeitada'; cstat?: string; motivo?: string; dica?: string | null; msg: string }
  | { tipo: 'ok'; msg: string }
  | { tipo: 'erro'; msg: string; semNcm?: string[] };

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const docFmt = (d: string) => (d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d || '—');
const dataHora = (s?: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const inp = 'w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-orange-500 focus:outline-none text-sm';
const lbl = 'block text-xs font-medium text-gray-400 mb-1';
const ATIVAS = ['autorizada', 'pendente', 'emitindo'];

export default function NfeModal({ sale, onClose }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [dest, setDest] = useState<NfeDest | null>(null);
  const [itens, setItens] = useState<NfeItem[]>([]);
  const [desconto, setDesconto] = useState('0');
  const [frete, setFrete] = useState('0');
  const [totalVenda, setTotalVenda] = useState(0);
  const [cert, setCert] = useState<NfeCert | null>(null);
  const [notas, setNotas] = useState<NfeNota[]>([]);
  const [producao, setProducao] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [baixando, setBaixando] = useState('');
  const [erroBaixar, setErroBaixar] = useState('');
  const [conferiuUf, setConferiuUf] = useState(false);
  const [conferiuTiny, setConferiuTiny] = useState(false);
  const [confirmarReal, setConfirmarReal] = useState(false);
  const tiny = temNotaTiny(sale);

  const carregarNotas = useCallback(async () => {
    const v = await nfeGet({ op: 'venda', id: sale.id }).catch((e: Error) => ({ erro: e.message }));
    if (v.erro) { setErroCarga(v.erro); return; }
    setCert(v.cert || null);
    setNotas(v.notas || []);
    setProducao(!!v.producao_liberada);
  }, [sale.id]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [r] = await Promise.all([rascunhoDaVenda(sale), carregarNotas()]);
        if (!vivo) return;
        setDest(r.dest);
        setItens(r.itens);
        setDesconto(String(r.desconto).replace('.', ','));
        setFrete(String(r.frete).replace('.', ','));
        setTotalVenda(r.total);
      } catch (e) {
        if (vivo) setErroCarga(e instanceof Error ? e.message : 'não consegui carregar a venda');
      } finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [sale, carregarNotas]);

  const setD = (k: keyof NfeDest, v: string) => setDest((d) => (d ? { ...d, [k]: v } : d));
  const setI = (k: number, campo: keyof NfeItem, v: string) => setItens((l) => l.map((x, j) => (j === k ? { ...x, [campo]: v } : x)));
  // trocou a UF (digitando ou pelo CEP): precisa conferir de novo
  const ufAtual = dest?.uf || '';
  useEffect(() => { setConferiuUf(false); }, [ufAtual]);
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
  const ativa = (amb: number) => notas.find((n) => n.ambiente === amb && ATIVAS.includes(n.status)) || null;
  const ativaReal = ativa(1), ativaTeste = ativa(2);
  const podeReal = producao && !ativaReal;
  const podeTeste = !ativaTeste;
  const certOk = cert ? cert.ok : true;
  const bloqueioComum = enviando || carregando || !dest || !ufLiberada || !certOk;

  const emitir = async (ambiente: 1 | 2) => {
    if (!dest || !ufLiberada) return;
    if (semNcm.length) { setRes({ tipo: 'erro', msg: `Item sem NCM: ${semNcm.join(', ')}. Cadastre o NCM em Produtos ou Acessórios (ou digite aqui) antes de emitir.`, semNcm }); return; }
    if (ambiente === 1 && tiny && !conferiuTiny) { setRes({ tipo: 'erro', msg: 'Esta venda já tem nota emitida pelo Tiny: marque a confirmação antes de emitir outra.' }); return; }
    setEnviando(true); setRes(null); setConfirmarReal(false);
    try {
      const j = await nfePost({
        op: 'emitir', ambiente, venda_id: sale.id, dest,
        itens: itens.map((i) => ({ ...i, qtd: numBR(i.qtd), valor: numBR(i.valor) })),
        desconto: totais.desc, frete: totais.fr, confirmar_tiny: ambiente === 1 && tiny && conferiuTiny,
      });
      if (j.ok) setRes({ tipo: 'autorizada', numero: j.numero, serie: j.serie, chave: j.chave, protocolo: j.protocolo, ambiente });
      else if (j.pendente) setRes({ tipo: 'pendente', id: j.id, msg: j.erro });
      else if (j.rejeitada) setRes({ tipo: 'rejeitada', cstat: j.cstat, motivo: j.motivo, dica: j.dica, msg: j.erro });
      else setRes({ tipo: 'erro', msg: j.erro || 'erro desconhecido', semNcm: j.sem_ncm });
    } catch (e) { setRes({ tipo: 'erro', msg: e instanceof Error ? e.message : 'falhou' }); }
    await carregarNotas();
    setEnviando(false);
  };

  const consultar = async (id: string) => {
    setEnviando(true);
    try {
      const j = await nfePost({ op: 'consultar', id });
      if (j.erro) setRes({ tipo: 'pendente', id, msg: j.erro });
      else if (j.status === 'autorizada') setRes({ tipo: 'ok', msg: `✅ Nota nº ${j.numero} autorizada na SEFAZ${j.protocolo ? ` — protocolo ${j.protocolo}` : ''}.` });
      else if (j.status === 'rejeitada') setRes({ tipo: 'rejeitada', msg: j.motivo || 'a nota não chegou na SEFAZ; pode emitir de novo' });
      else if (j.status === 'cancelada') setRes({ tipo: 'ok', msg: `⛔ A SEFAZ diz que a nota está cancelada${j.motivo ? ` (${j.motivo})` : ''}.` });
      else setRes({ tipo: 'pendente', id, msg: `Ainda sem resultado na SEFAZ${j.cstat ? ` (${j.cstat}: ${j.motivo})` : ''}. Tente de novo em alguns minutos.` });
    } catch (e) { setRes({ tipo: 'pendente', id, msg: e instanceof Error ? e.message : 'falhou' }); }
    await carregarNotas();
    setEnviando(false);
  };

  const baixar = async (tipo: 'pdf' | 'xml' | 'canc', id: string) => {
    setBaixando(`${tipo}${id}`); setErroBaixar('');
    try {
      if (tipo === 'pdf') await baixarDanfe(id); else if (tipo === 'xml') await baixarXml(id); else await baixarXmlCancelamento(id);
    } catch (e) { setErroBaixar(e instanceof Error ? e.message : 'falhou'); }
    setBaixando('');
  };
  const btnBaixar = (tipo: 'pdf' | 'xml' | 'canc', id: string, rot: string, cor = 'bg-gray-700 hover:bg-gray-600') => (
    <button type="button" disabled={!!baixando} onClick={() => baixar(tipo, id)} className={`${cor} disabled:bg-gray-600 px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5`}>
      <Download size={13} />{baixando === `${tipo}${id}` ? 'Baixando…' : rot}
    </button>
  );

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
          {producao ? (
            <div className="rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-200">
              <ShieldCheck size={15} className="inline -mt-0.5 mr-1" /><b>Notas reais liberadas</b>: "Autorizar na SEFAZ" emite nota <b>com valor fiscal</b>, com o nome real do cliente e dos produtos.
              {cert && (cert.ok
                ? <span className="block text-xs text-green-100/80 mt-1">Certificado OK até {cert.validade?.split('-').reverse().join('/')} ({cert.dias} dias).</span>
                : <span className="block text-xs text-red-300 mt-1">⚠️ {cert.erro}</span>)}
            </div>
          ) : (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
              🧪 <b>Ambiente de teste (homologação)</b>: a nota vai para a SEFAZ (SVRS) só para teste, <b>sem valor fiscal</b>. Série 2.
              {cert && (cert.ok
                ? <span className="block text-xs text-yellow-100/80 mt-1">Certificado OK até {cert.validade?.split('-').reverse().join('/')} ({cert.dias} dias).</span>
                : <span className="block text-xs text-red-300 mt-1">⚠️ {cert.erro}</span>)}
            </div>
          )}

          {tiny && (
            <div className="rounded-lg border border-yellow-500/60 bg-yellow-500/15 px-4 py-3 text-sm text-yellow-200" role="alert">
              <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={15} className="shrink-0" />Esta venda já tem nota emitida pelo Tiny.</p>
              {producao && (
                <label className="flex items-center gap-2 mt-2 text-yellow-100 cursor-pointer select-none">
                  <input type="checkbox" checked={conferiuTiny} onChange={(e) => setConferiuTiny(e.target.checked)} className="accent-yellow-500 h-4 w-4" />
                  Conferi e quero emitir outra nota real mesmo assim
                </label>
              )}
            </div>
          )}

          {carregando && <div className="flex items-center gap-2 text-gray-400 text-sm"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500" />Carregando a venda…</div>}
          {erroCarga && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{erroCarga}</div>}

          {notas.length > 0 && (
            <section>
              <h3 className="text-sm font-bold text-orange-400 mb-2">Notas desta venda</h3>
              <div className="space-y-2">
                {notas.map((n) => (
                  <div key={n.id} className="bg-gray-900/40 rounded-lg p-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                    <span className="font-semibold">Nº {n.numero} / série {n.serie}</span>
                    {n.ambiente === 2 && <span className="text-[10px] font-bold tracking-wide bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 rounded px-1.5 py-0.5">TESTE</span>}
                    <span>{STATUS_NFE[n.status] || n.status}</span>
                    <span className="text-xs text-gray-400">{dataHora(n.autorizada_em || n.criado_em)}{n.cancelada_em ? ` · cancelada ${dataHora(n.cancelada_em)}` : ''}</span>
                    {['rejeitada', 'pendente'].includes(n.status) && n.motivo && <span className="text-xs text-gray-400 w-full">{n.cstat ? `${n.cstat}: ` : ''}{n.motivo}</span>}
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:ml-auto">
                      {['autorizada', 'cancelada'].includes(n.status) && <>
                        {btnBaixar('pdf', n.id, 'Baixar DANFE (PDF)', 'bg-green-700 hover:bg-green-600')}
                        {btnBaixar('xml', n.id, 'Baixar XML')}
                      </>}
                      {n.status === 'cancelada' && btnBaixar('canc', n.id, 'Baixar XML do cancelamento')}
                      {['pendente', 'emitindo'].includes(n.status) && (
                        <button type="button" disabled={enviando} onClick={() => consultar(n.id)} className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
                          <RefreshCw size={13} className={enviando ? 'animate-spin' : ''} />Consultar SEFAZ
                        </button>
                      )}
                      <NfeCancelar nota={{ ...n, cliente: n.ambiente === 1 ? String(sale.customer_name || '') : null }} onFeito={async (msg) => { setRes({ tipo: 'ok', msg }); await carregarNotas(); }} />
                    </div>
                  </div>
                ))}
              </div>
              {erroBaixar && <p className="text-xs text-red-300 mt-2">{erroBaixar}</p>}
            </section>
          )}

          {dest && (podeReal || podeTeste) && (
            <>
              <section>
                <h3 className="text-sm font-bold text-orange-400 mb-2">Cliente</h3>
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 md:col-span-8">
                    <label className={lbl}>Nome</label>
                    <input className={inp} value={dest.nome} onChange={(e) => setD('nome', e.target.value)} />
                    <p className="text-xs text-gray-500 mt-1">Na nota de teste a SEFAZ exige o texto “{HOMOLOG_DEST}” no lugar do nome (o sistema troca sozinho).</p>
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
                <h3 className="text-sm font-bold text-orange-400 mb-2">Itens <span className="text-gray-500 font-normal text-xs">brinde entra com valor 0,00 · o NCM vem do cadastro de Produtos (brinde sem cadastro: pelo nome)</span></h3>
                <div className="space-y-2">
                  {itens.map((i, k) => {
                    const ncmOk = /^\d{8}$/.test(dig(i.ncm));
                    return (
                      <div key={k} className="grid grid-cols-12 gap-2 items-end bg-gray-900/40 rounded-lg p-2">
                        <div className="col-span-12 md:col-span-6">
                          <label className={lbl}>Nome{i.brinde ? ' (brinde)' : ''} <span className="text-gray-500">· código {i.codigo}</span></label>
                          <input className={inp} value={i.nome} onChange={(e) => setI(k, 'nome', e.target.value)} />
                          {k === 0 && <p className="text-xs text-gray-500 mt-0.5" title={HOMOLOG_ITEM}>Na nota de teste o 1º item sai com o texto da SEFAZ.</p>}
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

          {confirmarReal && dest && (
            <div className="rounded-lg border border-green-500/60 bg-green-500/10 px-4 py-3 text-sm" role="alertdialog" aria-label="Confirmar nota real">
              <p className="font-bold text-green-200">Confirmar a nota REAL (com valor fiscal)?</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 mt-2 text-green-100">
                <dt className="text-gray-400">Cliente</dt><dd>{dest.nome || '—'}</dd>
                <dt className="text-gray-400">CPF/CNPJ</dt><dd>{docFmt(dig(dest.doc))}</dd>
                <dt className="text-gray-400">Cidade</dt><dd>{dest.municipio}/{dest.uf}</dd>
                <dt className="text-gray-400">Total</dt><dd className="font-bold">{brl(totais.nota)}</dd>
              </dl>
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" disabled={bloqueioComum} onClick={() => emitir(1)} className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-4 py-2 rounded-lg font-semibold">Confirmar e autorizar</button>
                <button type="button" onClick={() => setConfirmarReal(false)} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700">Voltar</button>
              </div>
            </div>
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
          {res?.tipo === 'ok' && <div className="rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-200" role="status">{res.msg}</div>}
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
              <p className="font-bold text-green-300 flex items-center gap-2"><CheckCircle2 size={16} />{res.ambiente === 1 ? 'Nota autorizada' : 'Nota de teste autorizada'}{res.numero ? ` — nº ${res.numero}` : ''}{res.serie ? `, série ${res.serie}` : ''}</p>
              {res.protocolo && <p className="text-xs text-green-100/80 mt-1">Protocolo {res.protocolo}{res.chave ? ` · chave ${res.chave}` : ''}</p>}
              <p className="text-xs text-green-100/80 mt-1">DANFE e XML em “Notas desta venda”, acima.</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-end gap-2 px-6 py-4 border-t border-gray-700 sticky bottom-0 bg-gray-800">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700">Fechar</button>
          {producao ? (
            <div className="flex flex-col items-end gap-1">
              {podeReal && (
                <button type="button" disabled={bloqueioComum || confirmarReal || (tiny && !conferiuTiny)} onClick={() => { if (semNcm.length) { emitir(1); return; } setConfirmarReal(true); }}
                  title={!ufLiberada ? 'Marque "Conferi" no aviso de cliente fora do RJ' : tiny && !conferiuTiny ? 'Confirme o aviso da nota do Tiny' : undefined}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-5 py-2 rounded-lg font-semibold flex items-center gap-2">
                  {enviando ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Enviando para a SEFAZ…</> : <><ShieldCheck size={16} />Autorizar na SEFAZ</>}
                </button>
              )}
              {podeTeste && (
                <button type="button" disabled={bloqueioComum} onClick={() => emitir(2)} className="text-xs text-yellow-300 hover:text-yellow-200 underline disabled:text-gray-500 disabled:no-underline">
                  Emitir só um teste (homologação)
                </button>
              )}
            </div>
          ) : podeTeste && (
            <button type="button" disabled={bloqueioComum} onClick={() => emitir(2)}
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
