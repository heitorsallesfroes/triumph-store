# Valida XMLs de NF-e contra os schemas oficiais (scripts/tests/fixtures/nfe-xsd, PL_010 v1.30) e confere a
# assinatura XMLDSig com o SignedXml do .NET (implementação de C14N/RSA independente da do emissor).
# Uso (chamado por scripts/tests/nfe.test.ts):
#   powershell -NoProfile -ExecutionPolicy Bypass -File nfe-validar.ps1 -Xsd <arquivo.xsd> -Xml "<a.xml>|<b.xml>" [-Assinatura]
# Saída: uma linha por XML: "OK <arquivo>" ou "ERRO <arquivo> <mensagem>"; no fim, "ASSINATURA OK/ERRO" se pedido.
param(
  [Parameter(Mandatory = $true)][string]$Xsd,
  [Parameter(Mandatory = $true)][string]$Xml,
  [switch]$Assinatura
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$schemas = New-Object System.Xml.Schema.XmlSchemaSet
$schemas.XmlResolver = New-Object System.Xml.XmlUrlResolver
$null = $schemas.Add('http://www.portalfiscal.inf.br/nfe', (Resolve-Path $Xsd).Path)
$schemas.Compile()

foreach ($arq in ($Xml -split '\|')) {
  $erros = New-Object System.Collections.Generic.List[string]
  $cfg = New-Object System.Xml.XmlReaderSettings
  $cfg.ValidationType = [System.Xml.ValidationType]::Schema
  $cfg.Schemas = $schemas
  $cfg.add_ValidationEventHandler({ param($s, $e) $erros.Add("linha $($e.Exception.LineNumber) col $($e.Exception.LinePosition): $($e.Message)") })
  $r = [System.Xml.XmlReader]::Create((Resolve-Path $arq).Path, $cfg)
  try { while ($r.Read()) { } } catch { $erros.Add($_.Exception.Message) } finally { $r.Close() }
  if ($erros.Count -eq 0) { Write-Output "OK $arq" } else { Write-Output "ERRO $arq $($erros -join ' | ')" }

  if ($Assinatura) {
    $doc = New-Object System.Xml.XmlDocument
    $doc.PreserveWhitespace = $true
    $doc.Load((Resolve-Path $arq).Path)
    $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
    $ns.AddNamespace('ds', 'http://www.w3.org/2000/09/xmldsig#')
    $sigNode = $doc.SelectSingleNode('//ds:Signature', $ns)
    $sx = New-Object System.Security.Cryptography.Xml.SignedXml($doc)
    $sx.LoadXml([System.Xml.XmlElement]$sigNode)
    $b64 = $doc.SelectSingleNode('//ds:X509Certificate', $ns).InnerText
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(, [Convert]::FromBase64String($b64))
    if ($sx.CheckSignature($cert, $true)) { Write-Output "ASSINATURA OK $arq" } else { Write-Output "ASSINATURA ERRO $arq" }
  }
}
