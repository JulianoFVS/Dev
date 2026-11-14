'use client';

import { useMemo, useState } from 'react';
import { Building2, CircleAlert, Layers, Mail, Phone, Search, SearchX, Users } from 'lucide-react';
import {
  formatarDataHora,
  iniciais,
  normalizarBusca,
  pluralizar,
  rotuloNivelAcesso,
  type ConviteSaaS,
  type ProfissionalDaRedeSaaS,
} from '@/lib/saas';
import { ChipSuave } from './StatusChips';
import { EstadoVazio } from './Feedback';

type Props = {
  profissionais: ProfissionalDaRedeSaaS[];
  convites: ConviteSaaS[];
};

export default function RedeEquipe({ profissionais, convites }: Props) {
  const [busca, setBusca] = useState('');

  const pendentes = useMemo(
    () => convites.filter((convite) => convite.status === 'pendente'),
    [convites],
  );

  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca);
    if (!termo) return profissionais;
    return profissionais.filter((profissional) =>
      [profissional.nome, profissional.cargo, profissional.email, profissional.nivel_acesso].some(
        (campo) => normalizarBusca(campo).includes(termo),
      ),
    );
  }, [profissionais, busca]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-neutral-900">
          {pluralizar(profissionais.length, 'pessoa na rede', 'pessoas na rede')}
        </p>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          Quem atende nesta rede e as clínicas de cada pessoa.
        </p>
      </div>

      {profissionais.length > 0 && (
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar por nome, cargo ou e-mail"
            aria-label="Buscar profissionais da rede"
            className="h-11 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
          />
        </div>
      )}

      {profissionais.length === 0 ? (
        <EstadoVazio
          icone={<Users size={20} />}
          titulo="Nenhum profissional nesta rede"
          descricao="Convide a equipe pela tela de Equipe da clínica. Aqui o painel mostra apenas quem já está vinculado."
        />
      ) : filtrados.length === 0 ? (
        <EstadoVazio
          icone={<SearchX size={20} />}
          titulo="Nenhum profissional encontrado"
          descricao={`Não encontramos ninguém para "${busca.trim()}".`}
          acao={
            <button
              type="button"
              onClick={() => setBusca('')}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Limpar busca
            </button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtrados.map((profissional) => (
            <li key={profissional.id} className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f4f1] text-[11px] font-medium text-neutral-500">
                  {iniciais(profissional.nome)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="min-w-0 truncate text-sm font-medium text-neutral-900">
                      {profissional.nome}
                    </p>
                    {profissional.ativo === false && <ChipSuave tom="neutro">Inativo</ChipSuave>}
                    {profissional.is_super_admin === true && (
                      <ChipSuave tom="azul">Dono da plataforma</ChipSuave>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                    {profissional.cargo || rotuloNivelAcesso(profissional.nivel_acesso)}
                  </p>
                  {profissional.email && (
                    <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-neutral-500">
                      <Mail size={11} className="shrink-0" /> {profissional.email}
                    </p>
                  )}
                  {profissional.telefone && (
                    <p className="flex items-center gap-1 truncate text-[11px] text-neutral-500">
                      <Phone size={11} className="shrink-0" /> {profissional.telefone}
                    </p>
                  )}
                </div>
              </div>

              {profissional.clinicas_rede.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {profissional.clinicas_rede.map((clinica) => (
                    <ChipSuave key={clinica.id} tom="neutro">
                      <Building2 size={10} className="shrink-0" />
                      {clinica.nome}
                    </ChipSuave>
                  ))}
                </div>
              )}

              {profissional.outras_redes.length > 0 && (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800">
                  <Layers size={12} className="mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="font-medium">Também em: </span>
                    {profissional.outras_redes.map((rede) => rede.nome).join(', ')}
                  </span>
                </p>
              )}

              {profissional.clinicas_fora_da_rede.length > 0 && (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#f3f4f1] px-2.5 py-1.5 text-[11px] leading-relaxed text-neutral-600">
                  <CircleAlert size={12} className="mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="font-medium">Sem rede: </span>
                    {profissional.clinicas_fora_da_rede.map((clinica) => clinica.nome).join(', ')}
                  </span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {pendentes.length > 0 && (
        <section className="mt-1 rounded-xl border border-neutral-200 bg-[#fafaf8] p-3">
          <div className="flex items-center gap-2">
            <Mail size={14} className="text-neutral-500" />
            <h3 className="text-sm font-semibold text-neutral-900">Convites pendentes</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-neutral-600">
              {pendentes.length}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Somente leitura. Para convidar ou revogar, use Ajustes → Equipe.
          </p>
          <ul className="mt-2 space-y-1.5">
            {pendentes.map((convite) => (
              <li
                key={convite.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-neutral-800">
                    {convite.email ?? 'Convite sem e-mail'}
                  </p>
                  <p className="truncate text-[10px] text-neutral-400">
                    {convite.criado_em
                      ? `Enviado em ${formatarDataHora(convite.criado_em)}`
                      : 'Data não informada'}
                    {convite.convidante ? ` · por ${convite.convidante}` : ''}
                  </p>
                </div>
                <ChipSuave tom="ambar">Aguardando</ChipSuave>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
