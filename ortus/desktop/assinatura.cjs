'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

/**
 * Assinatura digital do instalador do Windows.
 *
 * `desktop/electron-builder.yml` herda este arquivo (`extends`). A
 * configuração é calculada na hora do build, a partir do AMBIENTE: nenhum
 * certificado, senha ou identificador de conta fica no repositório.
 *
 *   ORTUS_ASSINATURA=certificado   certificado de assinatura de código (OV ou EV)
 *   ORTUS_ASSINATURA=azure         Azure Trusted Signing
 *   ORTUS_ASSINATURA=nenhuma       instalador sem assinatura, de propósito
 *   (sem a variável)               assina se o ambiente tiver os dados de uma
 *                                  das duas opções; senão sai sem assinatura
 *
 * Quando a assinatura foi pedida e falta um dado, o build PARA aqui, antes de
 * compilar qualquer coisa, dizendo o nome de cada variável que falta. Com a
 * assinatura ligada, `forceCodeSigning` faz o electron-builder falhar se um
 * arquivo ficar sem assinar, e o instalador pronto é conferido de novo no fim.
 *
 * As variáveis podem vir do ambiente (segredos do GitHub Actions) ou do
 * arquivo `electron-builder.env`, na raiz, que o electron-builder carrega
 * sozinho e que NÃO pode ir para o repositório.
 *
 * Detalhes, custo e efeito no SmartScreen: desktop/README.md.
 */

function erroDeConfiguracao(mensagem) {
  try {
    // Erro deste tipo sai limpo no terminal, sem pilha de chamadas.
    const { InvalidConfigurationError } = require('builder-util');
    return new InvalidConfigurationError(mensagem);
  } catch {
    return new Error(mensagem);
  }
}

function valor(env, ...nomes) {
  for (const nome of nomes) {
    const texto = String(env[nome] == null ? '' : env[nome]).trim();
    if (texto) return texto;
  }
  return '';
}

/** O comando está gerando instalador do Windows? (`--win`, `-w`, ou padrão no Windows) */
function alvoWindows(argv, plataforma) {
  const argumentos = argv.slice(2);
  const curto = (letras) => argumentos.some((a) => /^-[a-z]+$/i.test(a) && new RegExp(`[${letras}]`, 'i').test(a.slice(1)));
  const windows = argumentos.includes('--win') || argumentos.includes('--windows') || curto('w');
  const outro =
    argumentos.includes('--mac') || argumentos.includes('--macos') || argumentos.includes('--linux') || curto('mol');
  if (windows) return true;
  if (outro) return false;
  return plataforma === 'win32';
}

/**
 * Lê o ambiente e decide o modo. Devolve o que falta quando a assinatura foi
 * pedida e não pode acontecer.
 */
function planejar(env) {
  const pedido = valor(env, 'ORTUS_ASSINATURA').toLowerCase();
  if (pedido && !['certificado', 'azure', 'nenhuma'].includes(pedido)) {
    return { modo: 'invalido', faltam: [], pedido };
  }

  const certificado = {
    arquivo: valor(env, 'WIN_CSC_LINK', 'CSC_LINK'),
    senha: valor(env, 'WIN_CSC_KEY_PASSWORD', 'CSC_KEY_PASSWORD'),
    // Certificado em token USB ou no repositório de certificados do Windows.
    sujeito: valor(env, 'ORTUS_ASSINATURA_SUJEITO'),
    sha1: valor(env, 'ORTUS_ASSINATURA_SHA1'),
    carimbo: valor(env, 'ORTUS_ASSINATURA_CARIMBO'),
  };
  const azure = {
    AZURE_TENANT_ID: valor(env, 'AZURE_TENANT_ID'),
    AZURE_CLIENT_ID: valor(env, 'AZURE_CLIENT_ID'),
    AZURE_CLIENT_SECRET: valor(env, 'AZURE_CLIENT_SECRET'),
    ORTUS_AZURE_ENDPOINT: valor(env, 'ORTUS_AZURE_ENDPOINT'),
    ORTUS_AZURE_CONTA: valor(env, 'ORTUS_AZURE_CONTA'),
    ORTUS_AZURE_PERFIL: valor(env, 'ORTUS_AZURE_PERFIL'),
    ORTUS_AZURE_PUBLICADOR: valor(env, 'ORTUS_AZURE_PUBLICADOR'),
  };
  const faltamAzure = Object.keys(azure).filter((nome) => !azure[nome]);
  const temCertificado = Boolean(certificado.arquivo || certificado.sujeito || certificado.sha1);
  const faltamCertificado = [];
  if (!temCertificado) {
    faltamCertificado.push('WIN_CSC_LINK (arquivo .pfx, em caminho ou base64) ou ORTUS_ASSINATURA_SUJEITO / ORTUS_ASSINATURA_SHA1 (certificado em token ou no Windows)');
  } else if (certificado.arquivo && !certificado.senha) {
    faltamCertificado.push('WIN_CSC_KEY_PASSWORD (senha do arquivo .pfx)');
  }

  if (pedido === 'nenhuma') return { modo: 'nenhuma', explicito: true, faltam: [] };
  if (pedido === 'azure') return { modo: 'azure', azure, faltam: faltamAzure };
  if (pedido === 'certificado') return { modo: 'certificado', certificado, faltam: faltamCertificado };

  // Sem pedido explícito: assina se o ambiente já trouxer tudo de uma opção.
  if (faltamAzure.length === 0) return { modo: 'azure', azure, faltam: [] };
  if (temCertificado && faltamCertificado.length === 0) return { modo: 'certificado', certificado, faltam: [] };
  // Metade dos dados de uma opção é assinatura esquecida pela metade, não
  // pedido de instalador sem assinatura: o build para dizendo o que falta.
  // (Só as variáveis ORTUS_AZURE_* contam como início do Azure: AZURE_* sozinhas
  // podem estar no ambiente para outra coisa.)
  if (temCertificado) return { modo: 'certificado', certificado, faltam: faltamCertificado, parcial: true };
  const azureComecado = ['ORTUS_AZURE_ENDPOINT', 'ORTUS_AZURE_CONTA', 'ORTUS_AZURE_PERFIL', 'ORTUS_AZURE_PUBLICADOR'].some((nome) => azure[nome]);
  if (azureComecado) return { modo: 'azure', azure, faltam: faltamAzure, parcial: true };
  return { modo: 'nenhuma', explicito: false, faltam: [] };
}

/** Confere a assinatura Authenticode de um arquivo. Só existe no Windows. */
function conferirAssinatura(arquivo) {
  const comando =
    `$a = Get-AuthenticodeSignature -LiteralPath '${arquivo.replace(/'/g, "''")}'; ` +
    'Write-Output ($a.Status.ToString() + "|" + $a.SignerCertificate.Subject)';
  const saida = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', comando], { encoding: 'utf8' }).trim();
  const [estado, titular = ''] = saida.split('|');
  return { valida: estado === 'Valid', estado, titular };
}

function configuracao(plano) {
  if (plano.modo === 'azure') {
    return {
      win: {
        forceCodeSigning: true,
        azureSignOptions: {
          publisherName: plano.azure.ORTUS_AZURE_PUBLICADOR,
          endpoint: plano.azure.ORTUS_AZURE_ENDPOINT,
          certificateProfileName: plano.azure.ORTUS_AZURE_PERFIL,
          codeSigningAccountName: plano.azure.ORTUS_AZURE_CONTA,
        },
      },
    };
  }
  if (plano.modo === 'certificado') {
    const { sujeito, sha1, carimbo } = plano.certificado;
    return {
      win: {
        forceCodeSigning: true,
        signtoolOptions: {
          // Windows 10 e 11 só precisam de SHA-256; a assinatura dupla com
          // SHA-1 gasta uma operação a mais por arquivo.
          signingHashAlgorithms: ['sha256'],
          ...(sujeito ? { certificateSubjectName: sujeito } : {}),
          ...(sha1 ? { certificateSha1: sha1 } : {}),
          ...(carimbo ? { rfc3161TimeStampServer: carimbo } : {}),
        },
      },
    };
  }
  // Sem assinatura pedida de propósito: não assina nem que haja certificado
  // de outra plataforma no ambiente.
  if (plano.explicito) return { win: { signExecutable: false } };
  return {};
}

/** Configuração-mãe do electron-builder (chamada por ele ao carregar o yml). */
function assinatura(_pedido, contexto = {}) {
  const env = contexto.env || process.env;
  const argv = contexto.argv || process.argv;
  const plataforma = contexto.plataforma || process.platform;
  const avisar = contexto.avisar || ((texto) => console.log(texto));

  // Build de macOS ou Linux: nada a decidir aqui.
  if (!alvoWindows(argv, plataforma)) return {};

  const plano = planejar(env);
  if (plano.modo === 'invalido') {
    throw erroDeConfiguracao(
      `ORTUS_ASSINATURA="${plano.pedido}" não existe. Use "certificado", "azure" ou "nenhuma".`,
    );
  }
  if (plano.faltam.length) {
    const origem = plano.parcial
      ? `O ambiente tem parte dos dados de assinatura (${plano.modo}), sem ORTUS_ASSINATURA definido`
      : `A assinatura digital foi pedida (ORTUS_ASSINATURA=${plano.modo})`;
    throw erroDeConfiguracao(
      `${origem}, mas falta:\n` +
        plano.faltam.map((nome) => `  - ${nome}`).join('\n') +
        '\n\nDefina essas variáveis nos segredos do GitHub Actions ou no arquivo electron-builder.env (fora do repositório).\n' +
        'Para gerar um instalador de teste sem assinatura, use ORTUS_ASSINATURA=nenhuma.',
    );
  }

  if (plano.modo === 'nenhuma') {
    avisar(
      '\n  ATENÇÃO: instalador do Windows SEM assinatura digital.\n' +
        '  O SmartScreen vai mostrar "O Windows protegeu o seu PC" e "Fornecedor desconhecido".\n' +
        '  Serve para teste. Para distribuir, veja "Assinatura digital" em desktop/README.md.\n',
    );
  } else {
    avisar(`\n  Assinatura digital: ${plano.modo === 'azure' ? 'Azure Trusted Signing' : 'certificado de assinatura de código'} (obrigatória neste build).\n`);
  }

  return {
    ...configuracao(plano),
    // Depois de tudo pronto: o que saiu está mesmo assinado?
    afterAllArtifactBuild: (resultado) => {
      const instaladores = (resultado.artifactPaths || []).filter((arquivo) => /\.exe$/i.test(arquivo));
      for (const arquivo of instaladores) {
        const nome = path.basename(arquivo);
        if (plano.modo === 'nenhuma') {
          avisar(`  • SEM ASSINATURA: ${nome}`);
        } else if (process.platform !== 'win32') {
          avisar(`  • ${nome}: assinatura não conferida (a conferência só roda no Windows)`);
        } else {
          const assinaturaDoArquivo = conferirAssinatura(arquivo);
          if (!assinaturaDoArquivo.valida) {
            throw erroDeConfiguracao(`${nome} saiu com assinatura "${assinaturaDoArquivo.estado}". O instalador não deve ser distribuído.`);
          }
          avisar(`  • assinado: ${nome} (${assinaturaDoArquivo.titular})`);
        }
      }
      return [];
    },
  };
}

module.exports = assinatura;
module.exports.planejar = planejar;
module.exports.alvoWindows = alvoWindows;
