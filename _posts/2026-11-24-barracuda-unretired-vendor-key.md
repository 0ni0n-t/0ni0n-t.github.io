---
title: "[사고 분석] Barracuda 침해 — 일이 끝난 뒤에도 살아 있던 외주 업체의 클라우드 키"
category: tech-docs
sub: "AWS"
description: "2026년 11월 공개된 Barracuda 클라우드 침해를 보안 초보자의 질문으로 따라가며, 폐기되지 않은 액세스 키 하나가 어떻게 클러스터까지 이어졌는지 공식 발표와 문서로 확인하고 내 EKS 랩에 적용해 봅니다."
date: 2026-11-24 20:00:00 +0900
---

Barracuda가 직접 낸 글([B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion))과 Trust Center 공지([B2](https://trust.barracuda.com/security/barracuda-xdr-integration-credentials))를 중심으로 읽었습니다. 언론과 벤더 글은 2차 출처로 표시했고, 공식 글에서 찾지 못한 내용은 찾지 못했다고 적었습니다.

## 뉴스 한 줄과 이 글의 자리

Barracuda는 2026년 11월 10일 공지와 11월 11일 블로그에서, 외주 AI 업체에 과거 프로젝트용으로 준 클라우드 액세스 키가 프로젝트가 끝난 뒤에도 폐기되지 않았고 그 키가 쓰였다고 밝혔습니다 ([B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion), [B2](https://trust.barracuda.com/security/barracuda-xdr-integration-credentials)).

이 글은 "회수되지 않은 신뢰(키, 역할, 토큰)"를 다루는 3편 시리즈의 1편입니다. [2편]({{ "/tech-docs/2026/11/24/qubole-trusted-cross-account-role/" | relative_url }})은 Qubole의 교차 계정 역할, [3편]({{ "/tech-docs/2026/11/24/coupang-unrotated-signing-key/" | relative_url }})은 쿠팡의 서명 키입니다.

저는 보안 전문가가 아니고 AWS EKS 컨테이너 포렌식 랩을 직접 만들어 돌려 본 초보자입니다([랩 글]({{ "/tech-docs/2026/11/23/eks-container-forensics-lab/" | relative_url }})). 랩에서 로그를 뒤져 본 뒤라 이 뉴스가 남의 일처럼 읽히지 않았습니다.

### 뉴스를 처음 읽고 든 질문

- 키 하나로 어디까지 들어갈 수 있었을까?
- 일이 끝났는데 그 키는 왜 남아 있었을까?
- 회사는 어떻게 알아챘을까?

## 1. 액세스 키가 뭐길래 키 하나로 들어올 수 있나요?

AWS 문서 [Manage access keys for IAM users](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html)와 [What is IAM?](https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html)부터 읽었습니다.

IAM은 AWS에서 누가 누구인지 확인하고(인증) 무엇을 해도 되는지 정하는(권한 부여) 서비스입니다. 프로그램도 AWS API를 부를 때 자격 증명으로 자신이 누구인지 증명해야 하는데, 그 방법 중 하나가 액세스 키입니다. 이 중 IAM 사용자에게 발급하는 장기 액세스 키는 자동으로 만료되지 않습니다. 임시 자격 증명에도 액세스 키 ID가 쓰이지만 만료 시각이 있는 별개의 종류입니다. 문서는 가능하면 임시 자격 증명을 쓰고, 키를 설정 파일에 넣지 말고, CloudTrail로 모니터링하라고 안내합니다.

그러니 장기 키는 비밀번호와 비슷합니다. 누가 쥐고 있든 그 키에 붙은 권한만큼 할 수 있습니다. Barracuda도 이번에 공격자가 "유효한 클라우드 액세스 키"로 들어왔다고 설명합니다 ([B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion)). 이 사고를 소프트웨어 취약점 이야기와 따로 놓고 보는 것은 제 해석입니다.

그런데 이런 키가 일이 끝난 뒤에도 살아 있었다면 누가 치웠어야 했을까요.

## 2. 일이 끝났는데 키는 왜 남아 있었나요? (근본 원인)

[B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion), [B2](https://trust.barracuda.com/security/barracuda-xdr-integration-credentials)와 AWS [Security best practices in IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)을 같이 봤습니다.

Barracuda는 과거 프로젝트 때문에 외주 AI 업체에 클라우드 액세스 키를 줬고, 프로젝트가 끝난 뒤에도 그 키를 폐기하지 않았습니다. 블로그는 이 부분을 "That is on us."라고 씁니다 ([B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion)). 쓰인 키는 업체의 GitHub 저장소 안 설정 파일에 저장돼 있었고, 업체 개발 환경이 침해되면서 노출됐다고 Trust Center가 적고 있습니다 ([B2](https://trust.barracuda.com/security/barracuda-xdr-integration-credentials)). 블로그는 2026년 10월에 업체 개발 환경이 침해됐고 키를 거기서 얻은 것으로 보인다고만 말해서, 키를 그 경로로 얻었다는 것은 아직 추정입니다 ([B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion)).

AWS 모범 사례에는 워크로드에 임시 자격 증명을 쓰고, 최소 권한을 주고, 쓰지 않는 자격 증명을 정기적으로 검토해 지우라는 항목이 있습니다 ([D3](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)). 안 쓰는 키를 지우라는 권고는 이번 일과 곧바로 이어집니다. 키에 최소 권한이 적용돼 있었는지, 업체가 키를 어떻게 관리했는지는 자료에서 찾지 못했습니다.

찾지 못한 것은 더 있습니다. 키를 언제 발급했는지, 프로젝트가 언제 끝났는지, 키에 어떤 권한이 붙어 있었는지가 공식 글에 없습니다. 2차 출처 Aviatrix의 "평문 저장"이라는 표현도 공식 글에서 확인하지 못해 사실로 쓰지 않았습니다.

키가 남아 있었다는 건 알겠는데, 공격자는 그걸로 실제로 무엇을 했을까요.

## 3. 공격자는 그 키로 어디까지 갔나요?

[B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion)의 타임라인을 따라갔습니다. 그림 번호는 아래 목록과 같습니다.

![Barracuda 침입 경로 타임라인]({{ '/assets/img/posts/barracuda-intrusion-path.svg' | relative_url }})

1. 업체에 준 키: 2026년 11월 1일 04:33 UTC에 이 키로 첫 호출이 있었다고 합니다 ([B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion)).
2. 클라우드 계정: 공격자는 자원을 훑고 계정에 저장된 비밀값(AWS 키, Azure 서비스 주체의 비밀)을 읽었습니다. 서비스 주체는 프로그램이 클라우드에 로그인할 때 쓰는 신분입니다.
3. 데이터 분석 시스템: 읽은 비밀값을 이어 써서 다음 시스템으로 넘어갔습니다.
4. 소스 코드 접근 토큰과 Kubernetes 클러스터: 이어서 소스 코드 접근 토큰을 얻고 그다음 클러스터까지 닿았습니다. 3과 4에 걸쳐 약 24시간, 11월 1일부터 2일 사이의 일입니다.
5. 발견과 차단: 11월 4일 직원 신고로 알려졌고, 그날 저녁(태평양 시간) 공격자 컨테이너를 제거했습니다. 다음 절에서 다시 봅니다.

클러스터에서는 Kubernetes 접근을 이용해 그 밑 서버의 파일시스템을 마운트한 컨테이너를 띄웠다고 Barracuda가 직접 적었습니다. 읽기 전용으로 제한된 컨테이너였지만 호스트 서버의 자격 증명을 모으기에는 충분했다고 합니다 ([B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion)). 그게 Kubernetes의 hostPath 볼륨이었는지는 공식 글에서 찾지 못했고, BleepingComputer 보도([S1](https://www.bleepingcomputer.com/news/security/barracuda-links-cloud-breach-to-artex-ai-powered-cyberattack/), 2차)는 이 컨테이너를 지속성 시도로 설명합니다.

별도로 11월 2일 초반 약 4시간 동안은 여러 저장소에 짧게 쓰고 지우는 브랜치를 올려, 빌드 워크플로(자동 빌드 절차)가 비밀값을 작업 로그에 찍게 했습니다. 로그가 비밀값을 가려 주는 장치는 인코딩으로 피했다고 합니다. 마지막 기록 활동은 11월 2일 23:31 UTC입니다 ([B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion)).

블로그 글은 계정 약 10개를 대략 44시간 동안 건드렸다고 씁니다. 저도 첫 호출(11/1 04:33)과 마지막 기록(11/2 23:31)을 직접 빼 봤는데 42시간 58분이 나왔습니다. 회사가 대략 44시간이라고 쓴 것과 크게 어긋나지는 않는 값입니다.

글에는 ARTEX라는 이름도 나옵니다. Barracuda는 도구와 기법이 오픈소스 AI 침투 프레임워크 ARTEX와 일치한다고 했지만 특정 집단의 소행이라고는 하지 않았습니다. 같은 도구는 누구든 쓸 수 있으니 "ARTEX가 공격했다"고 쓰면 틀린 말이 됩니다 ([B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion)).

이렇게 훑고 다닌 흔적을 회사는 어떻게 알아봤을까요.

## 4. 회사는 어떻게 알았고, 무엇을 했나요? (대응)

여기서도 [B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion)과 [B2](https://trust.barracuda.com/security/barracuda-xdr-integration-credentials)를 봤습니다. 시점이 섞이지 않게 표로 나눴습니다.

| 항목 | 공식 발표 내용 | 출처 |
|---|---|---|
| 발견 | 11월 4일 직원 한 명이 자기 계정의 이상 활동을 신고했고 거기서 역추적했습니다. 같은 날 업체도 자사 침해를 Barracuda에 알렸습니다. 신고 시점에 공격 활동은 이미 끝나 있었습니다 | [B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion) |
| 컨테이너 제거 | 태평양 시간 11월 4일 저녁에 공격자 컨테이너를 제거했습니다 | [B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion) |
| 자격 증명 교체 | 컨테이너 제거 뒤에 관련된 모든 시스템에서 자격 증명과 비밀값을 교체했습니다. 공격자가 닿을 수 있던 자격 증명은 모두 유출됐을 수 있는 것으로 간주했고, 자동화 서버 2대는 폐기했습니다 | [B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion), [B2](https://trust.barracuda.com/security/barracuda-xdr-integration-credentials) |
| 관리자 ID 시도 | 공격자가 새 관리자 클라우드 ID를 만들려 했고 그 시도를 막았습니다. 언제 막았는지는 적혀 있지 않습니다 | [B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion) |
| 고객 안내 | 11월 10일 Trust Center 공지. Managed XDR Cloud, Monitored Endpoint API 연동 고객 중 영향 가능 고객에게 직접 연락해 연동 자격 증명을 폐기 후 재생성하고 11월 1일 이후 활동 로그를 검토하도록 요청했습니다 | [B2](https://trust.barracuda.com/security/barracuda-xdr-integration-credentials) |
| 영향 판단 | 고객 연동 자격 증명이 저장된 시스템에는 닿았지만 열람한 직접 증거는 없습니다. 그 환경의 로깅이 배제할 만큼 상세하지 않았다고 블로그가 인정합니다 | [B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion) |

업체 키 자체를 정확히 언제 폐기했는지는 공식 발표에 없습니다. Aviatrix가 쓴 "약 4일 다운타임"도 공식에서 확인하지 못해 가져오지 않았습니다.

직원이 신고했을 때는 공격이 이미 끝나 있었다고 합니다. 44시간 가까이 움직였는데 그동안 왜 경보가 안 울렸는지가 계속 마음에 걸렸습니다.

## 5. 그래서 무엇이 모자랐나요? (미흡점)

공식 글에서 확인한 것부터 적습니다. 쓰지 않는 키를 폐기하지 않았다고 회사가 직접 인정했습니다. 직원 신고를 계기로 조사에 들어갔고 그때 공격 활동은 이미 끝나 있었습니다. 일부 환경은 로깅이 상세하지 않아 영향을 배제하지 못했습니다. Trust Center에 따르면 이후 영향받은 환경에 전체 감사 로깅을 켰고, 데이터 접근 로깅이 없던 곳에는 추가하는 중입니다 ([B1](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion), [B2](https://trust.barracuda.com/security/barracuda-xdr-integration-credentials)). 회사가 스스로 꼽은 교훈은 탐지와 대응 위주 전략의 한계, 장기 자격 증명 제거, 단기이고 좁은 범위의 자격 증명, 피해 범위 제한입니다.

여기서부터는 제 생각입니다. 프로젝트가 끝날 때 이 키를 누가 확인했을까요? 종료할 때 챙기는 목록에 키 폐기가 있었는지는 공식 글에서 찾지 못했습니다. 장기 키가 꼭 필요했다면 오래 안 쓰이던 키가 갑자기 쓰일 때 경고가 올라오게 했어야 하는데, 이번 키가 오래 잠자다 깨어난 것인지는 자료에 없어서 모릅니다. 키가 업체 저장소의 설정 파일에 있었던 것은 업체 쪽 관리 문제로 보입니다. 다만 준 쪽이 그 보관 방식을 점검할 수 없었다면 처음부터 임시 자격 증명으로 줬어야 했다고 생각합니다.

제 랩에도 오래전에 만들고 잊은 키가 있을지 모른다는 생각이 들어서, 찾는 방법부터 알아봤습니다.

## 6. 내 EKS 랩이라면 어떻게 찾고 막을 수 있을까요?

AWS [IAM 모범 사례](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)와 Kubernetes [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)를 참고해 명령을 만들었습니다. 아직 한 줄도 실행해 보지 않았습니다. 명령 안의 `lab-user`, `AKIAIOSFODNN7EXAMPLE`, `my-namespace`는 AWS 문서의 예시나 제가 지은 이름이니 실제 값으로 바꿔서 써야 합니다.

### 6-1. 안 쓰는 액세스 키 찾기

IAM 사용자의 키와 마지막 사용 시각을 봅니다. 마지막 사용이 오래된 키가 폐기 후보입니다.

```bash
aws iam list-users --query 'Users[].UserName' --output text
aws iam list-access-keys --user-name lab-user
aws iam get-access-key-last-used --access-key-id AKIAIOSFODNN7EXAMPLE
```

한 번에 보려면 자격 증명 보고서가 있습니다. 보고서는 만드는 데 시간이 걸릴 수 있어서, 첫 명령을 COMPLETE가 나올 때까지 되풀이해 실행한 다음에 두 번째 명령으로 가져와야 합니다. 최근 4시간 안에 만든 보고서가 있으면 새로 만들지 않고 그걸 돌려줄 수 있다고 해서([AWS 문서](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_getting-report.html)), 보고서의 생성 시각도 같이 봐야 합니다.

```bash
aws iam generate-credential-report --query State --output text
aws iam get-credential-report --query Content --output text | base64 -d
```

쓰지 않는 키는 바로 지우기보다 먼저 비활성화해 두고 문제가 없는지 지켜본 뒤 지울 생각입니다. 이 순서는 제 판단입니다.

```bash
aws iam update-access-key --user-name lab-user --access-key-id AKIAIOSFODNN7EXAMPLE --status Inactive
```

### 6-2. 키가 쓰인 흔적을 CloudTrail에서 찾기

의심되는 키 ID가 있으면 그 키가 부른 관리 이벤트를 조회합니다.

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIAIOSFODNN7EXAMPLE \
  --start-time 2026-11-01T00:00:00Z
```

이 명령에는 한계가 있습니다. 조회한 리전 한 곳의 최근 90일 관리 이벤트만 나옵니다. S3 객체 읽기 같은 데이터 이벤트는 따로 켜 둔 추적 로그나 이벤트 데이터 저장소에서 찾아야 하고, 다른 리전에서 한 일은 리전을 바꿔 다시 조회해야 합니다. 이 글을 쓰는 2026년 11월 24일에는 사고 기간(11월 1~2일)이 90일 안이지만, 2027년 1월 말쯤부터는 이 명령으로 못 찾습니다. 오래 묵은 키 사고라면 처음부터 이 방법으로는 부족할 수 있습니다.

로그의 한계는 이전 글에서도 겪었습니다. EC2에서 먼저 연습한 3-1절에서는 S3 데이터 이벤트를 켜 둔 덕에 어떤 키가 미끼 파일을 읽었는지는 CloudTrail로 알 수 있었지만, 그 키가 컨테이너 안 어느 프로세스에서 나왔는지는 알 수 없었습니다. EKS 랩 본 실습(3-6절)에서는 쿠버네티스 ServiceAccount의 API 호출이 AWS API가 아니어서 CloudTrail에 아예 남지 않았습니다. 그래서 Barracuda가 로깅이 모자라 접근 여부를 배제하지 못했다고 쓴 대목이 남의 이야기로 들리지 않았습니다.

### 6-3. 컨테이너가 호스트로 나가는 길 줄이기

호스트 경로를 컨테이너에 붙이는 hostPath 볼륨은 컨테이너가 노드의 파일, 거기 있을 수 있는 자격 증명에 닿는 길이 될 수 있습니다. Pod Security Standards의 Baseline 수준은 hostPath 볼륨을 금지합니다 ([D4](https://kubernetes.io/docs/concepts/security/pod-security-standards/)). 이번 사고에서 쓰인 방식이 hostPath인지는 확인되지 않았으니, 어디까지나 같은 종류의 길을 막아 보는 연습입니다.

네임스페이스에 Baseline을 강제하는 명령입니다.

```bash
kubectl label namespace my-namespace pod-security.kubernetes.io/enforce=baseline
```

hostPath가 정확히 어떻게 동작하는지는 [Volumes 문서](https://kubernetes.io/docs/concepts/storage/volumes/#hostpath)를 더 읽어 봐야겠습니다.

## 되돌아보기

| 질문 | 찾은 답 | 아직 모르는 것 |
|---|---|---|
| 키 하나로 어디까지? | 클라우드 계정에서 분석 시스템, 소스 코드 토큰, 클러스터까지 비밀값을 이어 썼습니다 | 키에 붙은 권한 |
| 키는 왜 남았나? | 프로젝트가 끝난 뒤에도 폐기하지 않았다고 회사가 인정했습니다 | 발급일과 종료일 |
| 어떻게 알았나? | 직원 신고였고, 그때 공격은 이미 끝나 있었습니다 | 업체 키를 폐기한 시점 |
| 무엇이 모자랐나? | 미사용 키 폐기와 일부 환경의 로깅입니다 | 실제 영향받은 고객 수 |
| 내 랩에서는? | 미사용 키 점검, CloudTrail 조회, Baseline 적용을 정리했습니다 | 직접 돌려 봤을 때의 결과 |

아직 가장 궁금한 것은 그 키에 어떤 권한이 붙어 있었는지입니다. 다음에는 랩에서 미사용 키 점검과 CloudTrail 조회를 직접 실행해 보고, 결과가 나오면 이 글에 덧붙이겠습니다.

## 읽고 나서 떠오른 우리 프로젝트

Barracuda가 11월 4일 저녁에 컨테이너를 제거했다는 대목을 읽다가 팀에서 했던 [컨테이너 포렌식 프로젝트]({{ "/tech-docs/2026/11/23/eks-container-forensics-lab/" | relative_url }})가 떠올랐습니다. 그때 파드를 재시작하자 메모리에 있던 토큰과 /tmp의 파일은 사라졌고, 영구 볼륨의 파일과 중앙으로 보낸 로그만 남았습니다. 그래서 지우기 전에 스냅샷부터 떴습니다. Barracuda가 컨테이너를 지우기 전에 무엇을 남겼는지는 공식 글에 없어서 모릅니다. 다만 침입자를 빨리 내보내는 일과 증거를 남기는 일이 같은 순간에 부딪힌다는 것은 직접 겪어 봐서 알 것 같았습니다.

로깅도 비슷했습니다. 프로젝트에서 몇몇 로그를 공격 중간에 켰더니 그 앞 단계는 끝내 볼 수 없었습니다. Barracuda도 사고 뒤에야 전체 감사 로깅을 켰다고 했습니다. 로그는 사고가 나기 전에 켜 둬야 쓸모가 있다는 걸 이번에 남의 사고로 한 번 더 확인했습니다.

## 다음 편 예고

[2편]({{ "/tech-docs/2026/11/24/qubole-trusted-cross-account-role/" | relative_url }})은 Qubole의 교차 계정 역할입니다. 키 대신 신뢰 관계가 남아 있을 때 어떤 일이 생기는지 이어서 찾아보겠습니다.

## 참고

1차 출처(Barracuda 공식)

- B1: [Forty-four hours: Anatomy of a machine-speed intrusion](https://blog.barracuda.com/2026/11/11/anatomy-of-a-machine-speed-intrusion), 2026-11-11
- B2: [Barracuda XDR integration credentials 공지](https://trust.barracuda.com/security/barracuda-xdr-integration-credentials), 2026-11-10 게시, 11-13 갱신. 2026-11-24에 다시 열어 확인함

2차 출처(언론, 벤더)

- S1: [BleepingComputer, 2026-11-16](https://www.bleepingcomputer.com/news/security/barracuda-links-cloud-breach-to-artex-ai-powered-cyberattack/). 마운트 컨테이너 부분은 공식 글에서 같은 내용을 확인했습니다.
- S4: [Aviatrix, 2026-11-17](https://aviatrix.ai/threat-research-center/barracuda-links-cloud-breach-to-artex-ai-powered-cyberattack/). 평문 저장과 다운타임 표현은 공식에 없어 쓰지 않았습니다. 벤더 홍보 성격입니다.

공식 문서

- D1: [Manage access keys for IAM users](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html)
- D2: [What is IAM?](https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html)
- D3: [Security best practices in IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- D4: [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- D5: [Kubernetes Volumes, hostPath](https://kubernetes.io/docs/concepts/storage/volumes/#hostpath), 해당 절은 직접 읽지 못함

사고 관련 기록은 2026-11-24에 열람한 상태이고, 이후 공지가 갱신될 수 있습니다.
