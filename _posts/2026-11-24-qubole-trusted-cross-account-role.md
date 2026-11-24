---
title: "[사고 분석] Qubole 경유 침해 — 쓰지 않는 연동에 남아 있던 신뢰 관계"
category: tech-docs
sub: "IAM"
description: "2026년 11월 공개된 Qubole 경유 AWS 교차 계정 침해를 보안 초보자의 질문으로 따라가며, External ID가 있었는데도 왜 막지 못했는지 Wiz·Sentra 보고서와 AWS 문서로 확인하고 내 계정의 신뢰 정책 점검법을 정리합니다."
date: 2026-11-24 20:10:00 +0900
---


## 뉴스 한 줄과 이 글의 자리

Wiz는 2026년 11월 9일 블로그에서, 10월 14일부터 26일 사이 누군가 Qubole의 AWS 계정에 속한 IAM 사용자 2개의 자격 증명으로 여러 고객 계정의 연동용 IAM 역할을 맡아 비밀값과 S3 데이터를 가져갔다고 밝혔습니다 ([W1](https://www.wiz.io/blog/qubole-cross-account-access-abused-in-the-wild)). 이 사고를 처음 발견해 Wiz에 알린 쪽은 피해 고객 환경을 지키던 보안 업체 Sentra입니다 ([T1](https://sentra.io/blog/breaches/inside-the-qubole-supply-chain-attack)).

이 글은 "회수되지 않은 신뢰"를 다루는 3편 시리즈의 2편입니다. [1편]({{ "/tech-docs/2026/11/24/barracuda-unretired-vendor-key/" | relative_url }})에서는 쓰지 않는 키가 남은 사고를 봤고, 이번에는 키 대신 고객 계정에 남은 신뢰 관계가 어떻게 이용됐는지 따라가 보겠습니다.

Qubole와 모회사 Idera가 낸 공식 공지는 제가 찾아본 범위에서 찾지 못했습니다. 그래서 사실의 근거는 침해 활동을 직접 관측한 Wiz와 Sentra의 보고서, 그리고 언론 보도입니다. 저는 보안 전문가가 아니고 AWS EKS 컨테이너 포렌식 랩을 만들어 돌려 본 초보자입니다([랩 글]({{ "/tech-docs/2026/11/23/eks-container-forensics-lab/" | relative_url }})).

기사를 읽으면서 제일 이해가 안 된 건 External ID라는 안전장치가 있었는데도 접근을 막지 못했다는 대목이었습니다. 그 전에 남의 계정이 내 계정의 역할을 맡는다는 게 무슨 뜻인지부터 찾아봤습니다.

## 1. 교차 계정 역할이 뭐고 신뢰 정책은 무슨 일을 하나요?

AWS 문서 [Access to AWS accounts owned by third parties](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios_third-party.html)와 [AssumeRole API](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html)부터 읽었습니다.

외부 업체가 내 AWS 리소스를 다뤄야 할 때, 내 계정에 IAM 역할을 만들어 두고 업체가 그 역할을 맡게 하는 방식이 있습니다. 문서는 이렇게 하면 내 자격 증명을 업체에 넘기지 않고 접근을 줄 수 있다고 설명합니다. 업체는 STS의 AssumeRole을 호출해 임시 자격 증명을 받고, 그 자격 증명으로 역할에 허락된 일만 합니다.

역할에는 정책이 두 종류 붙습니다. 권한 정책은 역할이 무엇을 할 수 있는지, 신뢰 정책은 누가 이 역할을 맡을 수 있는지를 정합니다. 신뢰 정책의 Principal 자리에 업체의 계정 번호를 적으면 그 계정에 역할을 맡길 수 있게 됩니다. 다만 그것만으로 끝은 아니고, 실제로 호출하는 쪽 신원에게도 sts:AssumeRole을 부를 권한이 있어야 하며 조건이나 명시적 거부도 함께 적용된다고 AssumeRole 문서에 나옵니다. 이번 사고에서 쓰인 길이 이 구조입니다. 고객들이 Qubole 계정을 신뢰하도록 만들어 둔 역할을, Qubole 계정의 IAM 사용자 자격 증명으로 맡았습니다 ([W1](https://www.wiz.io/blog/qubole-cross-account-access-abused-in-the-wild)).

신뢰 정책은 누가 지우기 전까지 그대로 있습니다. 연동을 더 쓰지 않아도 저절로 사라지지 않는다는 점이 이 사고에서 중요했습니다.

## 2. External ID가 있었는데 왜 못 막았나요?

같은 AWS 문서의 External ID 절과 [confused deputy 문서](https://docs.aws.amazon.com/IAM/latest/UserGuide/confused-deputy.html)를 읽었습니다.

External ID는 신뢰 정책 조건에 넣는 값입니다. 업체가 AssumeRole을 부를 때 이 값을 같이 보내야 하고, 값이 맞아야 역할을 맡을 수 있습니다. AWS 문서에 따르면 목적은 confused deputy 문제를 막는 것입니다. 업체가 여러 고객을 대신하는 구조에서 어떤 고객이 다른 고객의 역할 ARN을 업체에 알려 주면, 업체가 엉뚱한 고객의 역할로 일하게 될 수 있습니다. 그래서 업체가 고객마다 고유한 External ID를 만들어 관리하고, 각 고객의 역할을 맡을 때 그 고객의 값을 쓰게 해서 요청을 구분합니다.

저는 처음에 이 값이 비밀번호 같은 건 줄 알았습니다. 그런데 문서에는 "AWS does not treat the external ID as a secret."라는 문장이 있었고, 역할을 볼 수 있는 사람이면 누구나 External ID를 볼 수 있다고 합니다. Wiz도 이 값이 CloudTrail에 평문으로 남고 벤더 쪽 저장소나 코드에도 흔히 들어 있다고 지적했습니다. 이번 공격자는 AssumeRole 요청마다 올바른 External ID를 넣었고 전부 성공했습니다 ([W1](https://www.wiz.io/blog/qubole-cross-account-access-abused-in-the-wild)).

그러니 External ID는 다른 고객을 가장하는 속임수를 가려내는 장치이지, 벤더의 자격 증명이 새어 나간 상황을 막아 주는 장치는 아닌 것 같습니다. 다만 공격자가 올바른 값을 어디서 얻었는지는 보고서에 없어서 모릅니다.

## 3. 확인된 공격 경로와 아직 모르는 점은 무엇인가요? (근본 원인)

[W1](https://www.wiz.io/blog/qubole-cross-account-access-abused-in-the-wild)과 언론 보도 [The Register](https://www.theregister.com/a/5308553), [BleepingComputer](https://www.bleepingcomputer.com/news/security/hackers-exploit-trusted-aws-access-to-breach-multiple-cloud-environments/)를 같이 봤습니다. 사고 전체의 근본 원인은 아직 확정할 수 없어서, 이 절은 관측된 방식과 드러난 신뢰 관계까지만 적습니다.

관측된 것은 Qubole 계정 소속 IAM 사용자 2개의 자격 증명이 쓰였다는 점입니다. 또 The Register가 Wiz 보고서를 인용해, 많은 고객이 플랫폼을 더 쓰지 않는데도 신뢰 정책을 남겨 두었다고 전합니다. Wiz는 대부분의 환경에서 10월 중 Qubole 계정이 그 역할을 맡은 기록이 공격자의 요청뿐이었다고 적었습니다.

모르는 것이 오히려 더 많습니다. 자격 증명을 어떻게 손에 넣었는지, External ID를 어디서 얻었는지, Qubole 시스템이 침해됐는지는 제가 읽은 출처 어디에도 나와 있지 않습니다. CSA 노트는 벤더 시스템에 직접 접근했을 가능성이 가장 크다고 봤지만 자기들 추정이라고 밝혔습니다. Aviatrix 글에는 자격 증명 탈취나 내부자 같은 가능성이 나열돼 있는데 근거가 없어서 쓰지 않았습니다. 그림에서도 이 단계는 "경로 미확인"으로 표시했습니다.

공격자를 자칭하는 주장이 Wiz 글의 11월 11일 갱신에 인용돼 있지만, Wiz는 다른 활동과의 연관을 찾지 못했다고 했고 저는 원 보도를 열어 보지 못해서 다루지 않습니다.

## 4. 공격자는 어디까지 갔나요?

타임라인은 [W1](https://www.wiz.io/blog/qubole-cross-account-access-abused-in-the-wild)을 따랐고, 탐지 부분만 [T1](https://sentra.io/blog/breaches/inside-the-qubole-supply-chain-attack)에서 가져왔습니다. 그림 번호는 아래 목록과 같습니다.

![Qubole 경유 침해 공격 경로]({{ '/assets/img/posts/qubole-cross-account-attack-path.svg' | relative_url }})

1. Qubole 계정의 IAM 사용자 자격 증명: 공격자가 쓴 자격 증명이 어떻게 유출됐는지는 확인되지 않았습니다. 첫 AssumeRole은 10월 14일이었고, 두 번째 IAM 사용자는 10월 18일부터 쓰였습니다.
2. 고객 계정의 연동 역할: 공격자는 AssumeRole을 부르면서 올바른 External ID를 넣었고 전부 성공했습니다. 세션 이름은 quiam-으로 시작했습니다. Wiz가 적은 접속 IP는 Mullvad VPN과 OVH 서버였습니다.
3. 열거와 비밀값 읽기: 저장소, 컴퓨트, 데이터베이스 같은 자원을 훑고, Lambda 환경변수와 Secrets Manager, SSM Parameter Store의 비밀값을 읽었습니다.
4. S3 데이터 내려받기: 버킷 목록을 보고 객체를 가져갔습니다. 일부 세션에서는 버킷 전체를 가져갔다고 합니다.
5. 발견: 피해 고객 쪽 보안 업체 Sentra가 이상 활동을 탐지했고 Wiz에 전달했습니다. 정확한 탐지 날짜는 원문에 없습니다. Wiz가 마지막으로 관측한 활동은 10월 26일, 공개는 11월 9일입니다.

Wiz는 공격자가 비밀값을 읽은 뒤 TruffleHog 도구로 AWS 키, Entra ID 서비스 주체 비밀, Okta 클라이언트 자격 증명이 유효한지 검증한 활동도 봤다고 합니다. 이것은 피해 조직 소유의 자격 증명이고, Wiz는 이 활동을 기회주의적(opportunistic)이라고 평가했습니다.

수치는 Sentra 보고서에 있는 대로만 옮깁니다. Sentra가 관측해 보고한 범위에서 쓰기 작업은 0건이었고, 약 100개의 비밀번호와 키를 7분 안에 읽었으며, 한 회사에서는 수백만 개 파일에 접근했다고 합니다 ([T1](https://sentra.io/blog/breaches/inside-the-qubole-supply-chain-attack)). 쓰기 0건이 어떤 로그와 기간을 기준으로 센 것인지는 원문에 나와 있지 않아서, 사고 전체에서 쓰기가 없었다는 뜻으로 읽지는 않았습니다. BleepingComputer가 같은 수치를 인용했지만 독립적으로 확인된 것은 아닙니다. 피해 조직 수는 Wiz가 "multiple", BleepingComputer가 "tens of companies", Sentra가 "dozens"라고 써서 정확한 수를 모릅니다.

## 5. 누가 어떻게 알아챘고, 무엇을 했나요? (대응)

Sentra는 자사 고객 환경에서 이상 활동을 발견한 뒤, 약 한 시간 안에 Qubole와 연결된 고객을 모두 점검했고, 영향받은 고객에게는 직접 경고했다고 합니다. 조사에는 약 하루가 걸렸다고 하고, 이후 Wiz가 Sentra, Mandiant와 함께 조사했습니다 ([T1](https://sentra.io/blog/breaches/inside-the-qubole-supply-chain-attack), [W1](https://www.wiz.io/blog/qubole-cross-account-access-abused-in-the-wild)). 얼마나 빨리 움직였는지 궁금했는데, 그 한 시간을 어디서부터 쟀는지는 원문에서 찾지 못했습니다.

Wiz가 고객에게 한 권고는 연동 역할이 있는 계정의 10월 1일 이후 CloudTrail 검토, 비밀값과 S3 접근 조사, 노출된 자격 증명 교체, 쓰지 않는 연동 제거였습니다 ([W1](https://www.wiz.io/blog/qubole-cross-account-access-abused-in-the-wild), [N2](https://www.bleepingcomputer.com/news/security/hackers-exploit-trusted-aws-access-to-breach-multiple-cloud-environments/)). 10월 1일은 로그를 보기 시작하라는 권고일이고 공격이 시작된 날은 아닙니다. 공격 활동 기간은 Wiz 기준 10월 14일부터 26일입니다.

정작 Qubole와 Idera 쪽 소식은 찾지 못했습니다. 공개된 공식 공지나 원인 분석, 고객 고지에 관한 자료는 찾지 못했고, The Register에는 응답이 없었으며 BleepingComputer는 응답을 기다리는 중이라고 적었습니다. 자격 증명을 폐기하거나 교체했다는 근거도 못 찾았고, Sentra는 활동은 멈췄지만 신뢰 관계는 그대로 남아 있었다고 적었습니다. AWS는 서비스가 침해되지 않았고 설계대로 동작했다는 취지로 밝혔는데, 이 문장은 AWS 원문이 아니라 두 언론이 전한 인용이라 2차 출처입니다 ([N1](https://www.theregister.com/a/5308553), [N2](https://www.bleepingcomputer.com/news/security/hackers-exploit-trusted-aws-access-to-breach-multiple-cloud-environments/)).

Qubole 쪽에서 탐지했다는 기록이 없다는 것이 제게는 가장 낯설었습니다. 제가 못 찾았을 수도 있어서 단정은 하지 않겠습니다.

## 6. 그래서 무엇이 모자랐나요? (미흡점)

공식 공지가 없어서, 보고서에서 읽은 것과 제 생각을 나눠 적겠습니다.

많은 고객이 플랫폼을 쓰지 않게 된 뒤에도 신뢰 정책을 남겨 두었다고 보도됐습니다. Sentra는 사고 전부터 몇 달 동안 안 쓰인 Qubole 역할 하나를 표시해 뒀다고 합니다. 민감한 데이터에도 닿을 수 있는 역할이었습니다 ([T1](https://sentra.io/blog/breaches/inside-the-qubole-supply-chain-attack)). 이런 역할은 목록만 만들어 둬도 위험이 보인다는 뜻으로 읽혔습니다.

Wiz는 방어 권고에서 소스 IP 조건 하나만 있었어도 자신들이 관측한 모든 역할 수임이 막혔을 것이라고 평가했습니다 ([W1](https://www.wiz.io/blog/qubole-cross-account-access-abused-in-the-wild)). 올바른 External ID를 가진 공격자도 정해 둔 IP 밖에서 부르면 막혔다는 이야기입니다. 다만 이것은 Wiz가 관측한 요청에 한정된 평가입니다. 고객들의 실제 신뢰 정책이 어땠는지, 조건이 있었다면 사고 전체가 어떻게 달라졌을지는 확인된 바가 없습니다. 벤더 계정의 자격 증명을 어떻게 관리했는지도 어느 출처에 없습니다.

연동을 끊을 때 고객 쪽에서 누가 역할의 신뢰 정책을 지울지 정해 둔 곳이 얼마나 될지 궁금합니다. 서비스 해지 절차에 "내 계정에 만든 역할 삭제"가 들어 있지 않으면, 이번 같은 일이 남의 이야기가 아닐 것 같습니다. 또 External ID를 비밀로 믿고 다른 조건을 걸지 않은 계정이 있었는지는 자료로 알 수 없습니다.

이 대목을 읽고 IAM 콘솔의 역할 목록이 떠올랐습니다. 제가 만든 역할 중에 다른 계정을 믿고 있는 게 있는지 확인해 보고 싶었습니다.

## 7. 내 계정의 교차 계정 신뢰 정책은 어떻게 찾고 줄일까요?

AWS 문서 [IAM Access Analyzer](https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-access-analyzer.html), [CloudTrail 연동](https://docs.aws.amazon.com/IAM/latest/UserGuide/cloudtrail-integration.html)과 CLI 문서를 읽으며 아래 명령을 적어 두었습니다. 제 랩에서는 아직 실행하지 못했습니다. 명령 안의 `vendor-integration-role`, `111122223333`, `lab-external-access`는 제가 지은 예시 값이니 실제 값으로 바꿔서 써야 합니다.

### 7-1. 역할 신뢰 정책에서 다른 계정 찾기

먼저 역할마다 신뢰 정책의 Principal.AWS 값을 뽑아 봅니다. 내 계정 번호가 아닌 번호가 보이면 점검 대상입니다.

```bash
aws iam list-roles --query 'Roles[].[RoleName,AssumeRolePolicyDocument.Statement[].Principal.AWS]' --output json
```

이 쿼리는 Principal.AWS만 보여 주는 출발점입니다. Service나 Federated, 와일드카드 Principal은 따로 나오지 않을 수 있고 Condition도 표시되지 않습니다. 그래서 의심되는 역할은 전체 신뢰 정책을 열어 Principal과 Condition을 직접 읽어야 합니다.

```bash
aws iam get-role --role-name vendor-integration-role --query 'Role.AssumeRolePolicyDocument'
```

Principal에 다른 계정 번호가 있는데 Condition이 sts:ExternalId뿐이라면, 앞에서 본 것처럼 그 값은 비밀이 아니니 소스 IP 같은 다른 조건도 있는지 같이 보려 합니다.

### 7-2. Access Analyzer로 외부 접근 찾기

IAM Access Analyzer는 계정 밖 주체가 내 리소스에 접근할 수 있는지 찾아 줍니다. AWS 문서는 신뢰하는 범위 밖 계정이 내 역할을 맡을 수 있는지 알아볼 때 이 서비스를 쓰라고 안내합니다. 계정 단위 분석기를 만든 뒤 역할에 대한 결과만 가져오는 흐름입니다.

```bash
aws accessanalyzer create-analyzer --analyzer-name lab-external-access --type ACCOUNT --region ap-northeast-2
aws accessanalyzer list-analyzers --type ACCOUNT --region ap-northeast-2
aws accessanalyzer list-findings --region ap-northeast-2 --analyzer-arn arn:aws:access-analyzer:ap-northeast-2:111122223333:analyzer/lab-external-access --filter '{"resourceType": {"eq": ["AWS::IAM::Role"]}}'
```

분석기를 만든 직후에는 분석이 끝나지 않아 결과가 비어 있을 수 있으니, 두 번째 명령으로 분석기 상태부터 봅니다. 상태 값은 CREATING, ACTIVE, DISABLED, FAILED 중 하나인데, ACTIVE는 분석기가 돌고 있다는 뜻이지 첫 분석이 다 끝났다는 뜻은 아니라서 시간을 두고 다시 조회하는 게 좋겠습니다([AWS 문서](https://docs.aws.amazon.com/cli/latest/reference/accessanalyzer/list-analyzers.html)). ARN의 리전과 CLI를 실행하는 리전도 같아야 합니다. 결과가 비었다고 해서 외부에서 맡을 수 있는 역할이 없다고 단정할 수도 없습니다. 이 분석기는 내 계정에 있는 지원 대상 리소스를 보고 계정 밖에서 접근할 수 있는지를 찾는 것이라, 지원하지 않는 리소스나 아직 반영되지 않은 변경은 빠질 수 있습니다([AWS 문서](https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-findings.html)).

### 7-3. CloudTrail에서 AssumeRole 흔적 찾기

성공한 교차 계정 역할 수임은 역할이 있는 대상 계정의 CloudTrail에서 볼 수 있고, 호출한 쪽 IP와 세션 이름 같은 단서가 들어 있다고 문서에 나옵니다. 아래 명령은 AssumeRole 이벤트를 조회합니다.

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRole \
  --start-time 2026-10-01T00:00:00Z
```

단, 거부된 교차 계정 AssumeRole은 대상 계정에 기록되지 않는다고 문서에 나옵니다. 그래서 조회 결과가 없어도 시도가 없었다고 믿을 수는 없었습니다. 이 명령은 조회한 리전 한 곳의 최근 90일 관리 이벤트만 보여 주고, S3 객체 읽기 같은 데이터 이벤트는 따로 켜 둔 추적 로그나 이벤트 데이터 저장소에서 찾아야 합니다. 이 글을 쓰는 11월 24일에는 10월 1일이 90일 안이지만 시간이 지나면 조회되지 않습니다.

쓰지 않는 역할은 바로 지우지 않고, 정말 안 쓰이는지 CloudTrail로 확인한 뒤에 지우려고 합니다.

## 되돌아보기

| 질문 | 찾은 답 | 아직 모르는 것 |
|---|---|---|
| 교차 계정 역할은? | 신뢰 정책에 적힌 계정이, 호출 권한까지 갖췄을 때 역할을 맡아 임시 자격 증명을 받습니다 | 이번 고객들의 정책 구성 |
| External ID가 왜 못 막았나? | 비밀값이 아니고, 공격자가 올바른 값을 보냈습니다 | 그 값을 얻은 경위 |
| 확인된 경로는? | 벤더 계정의 IAM 자격 증명 사용과, 쓰지 않는 연동의 신뢰 정책 잔존이 관측됐습니다 | 자격 증명을 얻은 방법, 근본 원인 |
| 누가 알았고 무엇을 했나? | 피해 고객 쪽 보안 업체 Sentra가 탐지했습니다 | Qubole의 대응과 공지 |
| 내 계정에서는? | 신뢰 정책 조회, Access Analyzer, CloudTrail 조회를 정리했습니다 | 직접 돌려 봤을 때의 결과 |

끝까지 찾지 못한 건 자격 증명과 External ID를 처음 어떻게 얻었는지입니다. 일단 제 랩에서 외부 계정을 신뢰하는 역할이 있는지 직접 확인해 보고, 결과가 나오면 이 글에 덧붙이겠습니다.

## 사고를 읽다가 떠오른 팀 프로젝트

팀에서 했던 [컨테이너 포렌식 프로젝트]({{ "/tech-docs/2026/11/23/eks-container-forensics-lab/" | relative_url }})의 EC2 사전 실습이 생각났습니다. 웹 서버 역할의 임시 자격 증명을 메타데이터에서 꺼내 미끼 파일 1개를 가져가게 했고, 그 흔적을 CloudTrail 관리 이벤트와 S3 데이터 이벤트로 거슬러 올라가 찾았습니다. 훔친 역할을 그 서버 안에서 그대로 썼을 때는 CloudTrail에 찍히는 IP가 원래 서버와 같아서, IP만으로는 이상을 알 수 없었습니다.

랩에서는 서버에 붙은 역할의 자격 증명을 꺼내 썼고, 이번에는 벤더 계정의 자격 증명으로 고객 계정의 역할을 맡았다는 점이 다릅니다. 로그에 찍힌 호출자가 고객이 직접 믿기로 한 이름이라 겉보기엔 평소와 같았을 것 같습니다. Wiz가 적은 접속 IP는 VPN과 OVH 서버였는데, 평소 Qubole이 어디서 접속하는지 알고 있었다면 이런 주소가 눈에 띄었을까요? 실제 고객 환경의 로그는 제가 본 적이 없어서 어디까지나 궁금증입니다.

## 다음 편 예고

[다음 글]({{ "/tech-docs/2026/11/24/coupang-unrotated-signing-key/" | relative_url }})에서는 쿠팡 사고를 읽으면서 서명 키가 어떤 역할을 하는지부터 살펴보겠습니다.

## 참고

1차 기술 출처(침해 활동을 직접 관측한 조사 주체)

- W1: [Wiz, Qubole cross-account access abused in the wild](https://www.wiz.io/blog/qubole-cross-account-access-abused-in-the-wild), 2026-11-09 게시, 11-11 갱신
- T1: [Sentra, Inside the Qubole supply chain attack](https://sentra.io/blog/breaches/inside-the-qubole-supply-chain-attack), 2026-11-09

Qubole와 Idera의 공식 공지, 피해 고객의 공식 공지는 열람한 범위에서 찾지 못했습니다.

2차 출처(언론, 분석 노트)

- N1: [The Register, 2026-11-09, 11-10 갱신](https://www.theregister.com/a/5308553). AWS 성명은 이 글과 N2를 거친 인용입니다.
- N2: [BleepingComputer, 2026-11-10, 11-11 갱신](https://www.bleepingcomputer.com/news/security/hackers-exploit-trusted-aws-access-to-breach-multiple-cloud-environments/)
- N3: [Cloud Security Alliance 연구 노트, 2026-11-10](https://labs.cloudsecurityalliance.org/research/csa-research-note-qubole-cross-account-role-abuse-20261110-c/)
- Aviatrix의 해당 사건 글은 벤더 홍보 성격이고 근거를 확인하지 못한 표현이 있어 사실로 쓰지 않았습니다.

공식 문서

- D1: [Access to AWS accounts owned by third parties](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios_third-party.html)
- D2: [AssumeRole](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html)
- D3: [The confused deputy problem](https://docs.aws.amazon.com/IAM/latest/UserGuide/confused-deputy.html)
- D4: [CloudTrail integration](https://docs.aws.amazon.com/IAM/latest/UserGuide/cloudtrail-integration.html)
- D5: [What is IAM Access Analyzer?](https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-access-analyzer.html), 해당 문서 본문은 직접 읽지 못함

사고 관련 기록은 2026-11-24에 열람한 상태이고, 이후 공지가 갱신될 수 있습니다.
