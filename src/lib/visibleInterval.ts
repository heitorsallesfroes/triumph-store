// Atualização automática que só roda com a aba VISÍVEL (desempenho do banco).
// - A cada `ms`, chama `fn` se a aba estiver visível.
// - Ao voltar para a aba, chama `fn` se a última vez foi há mais de `ms`.
// Devolve a função que desliga (usar no retorno do useEffect).
export function startVisibleInterval(fn: () => void, ms: number): () => void {
  let last = Date.now();
  const run = () => {
    last = Date.now();
    fn();
  };
  const iv = setInterval(() => {
    if (document.visibilityState === 'visible') run();
  }, ms);
  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - last >= ms) run();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(iv);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export const AUTO_REFRESH_5_MIN = 5 * 60 * 1000;
