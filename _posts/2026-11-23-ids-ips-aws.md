---
title: "[기술문서] IDS와 IPS — 동작 원리부터 AWS에서 직접 탐지·차단해 보기까지"
category: tech-docs
sub: "AWS"
description: "침입 탐지(IDS)와 침입 방지(IPS)의 동작 원리, 유형, 장단점, 차이를 정리하고, AWS GuardDuty와 Network Firewall로 경보와 차단을 직접 만들어 로그로 확인했습니다."
---

이 글의 캡처와 로그에서 AWS 계정 번호와 사용자 이름은 가렸습니다. 사설 IP와 리소스 ID는 실습 흐름을 따라가는 데 필요해서 그대로 두었고, 실습 자원은 글을 쓴 뒤 모두 지웠습니다.

## 0. 이 주제를 고른 이유

지금 QEMU 가상 머신에서 이상 행위를 잡아내는 도구를 만들고 있습니다. 이 도구에는 이상 행위를 찾는 부분과 막는 부분이 따로 있습니다. 만들다 보니 찾는 일과 막는 일을 나누는 기준이 IDS와 IPS를 나누는 기준과 같다는 것을 알게 됐습니다. 그래서 이번 미션에서는 개념을 정리하는 데서 그치지 않고, 클라우드에서 두 가지를 직접 만들어 차이를 눈으로 확인해 보기로 했습니다.

| 이 글에서 답할 질문 | 짧은 답 |
|---|---|
| 방화벽이 있는데 IDS/IPS가 왜 또 필요한가? | IP·포트 중심의 방화벽은 패킷의 머리를 보고, IDS/IPS는 구현에 따라 내용·흐름·로그까지 봅니다 (1장) |
| IDS/IPS는 어떤 순서로 일하나? | 수집 → 분석 → 판정 → 대응 (2장) |
| 어떤 종류가 있나? | 설치 위치로 네트워크형과 호스트형, 탐지 방식으로 시그니처형과 이상 탐지형 (3·4장) |
| IDS와 IPS는 정확히 뭐가 다른가? | IDS는 탐지와 경보, IPS는 탐지와 직접 차단이 중심입니다. 직접 막으려면 트래픽이나 그 동작을 제어할 수 있는 위치에 있어야 합니다 (5장) |
| AWS에서는 무엇이 그 역할을 하나? | GuardDuty는 IDS, Network Firewall과 WAF는 IPS에 가깝습니다 (6·7장) |

## 1. 기초 — 방화벽만으로는 왜 부족한가

제가 이해한 패킷 구조부터 정리합니다. 패킷은 머리(헤더)와 내용(페이로드)으로 나뉩니다. 머리에는 출발지와 목적지 IP, 포트, 프로토콜이 들어 있고, 내용에는 실제로 주고받는 데이터가 들어 있습니다.

![패킷의 머리와 내용을 나누고, 방화벽은 머리만 보고 패킷을 직접 검사하는 IDS/IPS는 내용과 흐름까지 본다는 비교 그림]({{ '/assets/img/posts/ids-ips-layers.svg' | relative_url }})

여기서 말하는 방화벽은 IP와 포트 중심으로 판단하는 전통적인 방화벽입니다. 제품에 따라 내용까지 보는 방화벽도 있지만, 이 글에서는 이 기준으로 구분합니다. 이런 방화벽은 머리를 보고 판단합니다. 이 IP에서 443 포트로 오는 연결은 허용한다는 식입니다. AWS의 보안 그룹과 네트워크 ACL도 IP·포트·프로토콜로 규칙을 정한다는 점에서 이쪽에 가깝다고 이해했습니다. 그런데 공격이 허용된 포트를 그대로 타고 들어올 수도 있습니다. 웹 서버라면 443 포트는 열어 둘 수밖에 없고, SQL 인젝션 같은 공격 문자열도 그 열린 포트로 들어올 수 있습니다.

IDS(Intrusion Detection System)와 IPS(Intrusion Prevention System)는 구현에 따라 패킷 내용, 연결 흐름, 또는 로그를 분석합니다. 패킷을 직접 보는 장비는 여러 패킷을 하나의 흐름으로 묶어 그 연결에서 무슨 일이 일어나고 있는지 판단하고, 로그를 보는 서비스는 기록된 이벤트에서 이상한 행동을 찾습니다. NIST는 두 기술을 묶어 IDPS라고 부르고 하나의 지침(SP 800-94)으로 다룹니다.

## 2. 동작 원리 — 수집, 분석, 판정, 대응

공부한 내용을 네 단계로 정리하면 다음과 같습니다(내 정리).

![수집, 분석, 판정, 대응 4단계. 분석은 패킷을 받을 때와 로그를 받을 때로 나뉘고, 대응에서 IDS는 경보, IPS는 차단으로 갈라지는 흐름도]({{ '/assets/img/posts/ids-ips-pipeline.svg' | relative_url }})

1. 수집: 패킷을 직접 받거나 복사본을 받습니다. 로그(DNS 질의 기록, 흐름 기록)를 읽는 방식도 있습니다.
2. 분석: 패킷을 받은 경우에는 흩어진 패킷을 TCP 연결 단위로 묶고, HTTP라면 URI와 헤더를, TLS라면 접속하려는 도메인 이름(SNI)을 꺼냅니다. 로그를 받은 경우에는 로그에 기록된 필드(출발지, 목적지, 조회한 도메인, 호출한 API 등)를 정리합니다.
3. 판정: 꺼낸 값을 규칙과 비교하거나, 평소 행동과 얼마나 다른지 계산합니다.
4. 대응: IDS는 경보를 남기고, IPS는 차단합니다. 네트워크형 IPS라면 그 패킷을 버립니다.

①~③은 IDS와 IPS가 크게 다르지 않습니다. 가장 큰 차이는 ④이고, 직접 차단하려면 트래픽이나 그 동작을 제어할 수 있는 위치에 있어야 합니다. 네트워크형이라면 통신 경로 안, 호스트형이라면 서버 안이 그런 위치입니다. 5장에서 이 부분을 자세히 봅니다.

AWS에 대입하면, GuardDuty는 로그를 분석해 탐지 결과를 냅니다(①~④ 중 ④가 경보). 7장 실습의 Network Firewall은 패킷을 직접 받아 `alert` 규칙으로는 경보를 남기고 `drop` 규칙으로는 패킷을 버렸습니다.

## 3. 유형 ① — 어디에 설치하나: 네트워크형과 호스트형

![네트워크 길목의 센서 하나가 여러 서버를 보는 NIDS와, 서버마다 에이전트를 두는 HIDS 비교 그림]({{ '/assets/img/posts/ids-ips-nids-hids.svg' | relative_url }})

| 일반적인 구분 (내 정리) | 네트워크형 (NIDS/NIPS) | 호스트형 (HIDS/HIPS) |
|---|---|---|
| 위치 | 네트워크 길목(서브넷 경계, 인터넷 출입구) | 각 서버 안의 에이전트 |
| 보는 것 | 패킷, 연결 흐름 | 프로세스 실행, 파일 변경, 시스템 콜, 로그인 기록 |
| 장점 | 센서 하나로 많은 서버를 봅니다. 서버에 아무것도 설치하지 않습니다 | 서버 안의 파일 접근, 프로세스 실행, 네트워크 연결 같은 행위를 봅니다 |
| 단점 | 복호화하지 않으면 암호화된 내용은 못 봅니다. 서버 안에서 벌어진 일은 모릅니다 | 서버마다 설치하고 관리해야 하고, 서버 자원을 씁니다 |
| AWS에서 | Network Firewall, Traffic Mirroring + Suricata, VPC Flow Logs를 분석하는 GuardDuty | GuardDuty Runtime Monitoring (보안 에이전트로 EKS, ECS, EC2의 파일 접근·프로세스 실행·네트워크 연결을 봄) |

AWS의 Traffic Mirroring은 네트워크 인터페이스의 트래픽을 복사해 경로 밖의 보안 장비로 보내는 기능입니다. 이 복사본을 받아 Suricata 같은 오픈소스 IDS를 돌리면 전통적인 NIDS 구성이 된다고 이해했습니다(직접 구성해 보지는 않았습니다).

헷갈리기 쉬운 서비스가 하나 있습니다. AWS 문서는 Amazon Inspector를 EC2, ECR 컨테이너 이미지, Lambda의 소프트웨어 취약점과 의도하지 않은 네트워크 노출을 찾는 취약점 관리 서비스로 설명합니다. 그래서 이 글에서는 Inspector를 IDS가 아니라 취약점 관리 서비스로 구분했습니다.

## 4. 유형 ② — 어떻게 찾나: 시그니처 기반과 이상 탐지 기반

제가 이해한 방식으로 정리하면, 시그니처 기반은 이미 알려진 공격의 특징을 규칙으로 적어 두고, 들어온 트래픽이 그 규칙과 맞는지 봅니다. 백신의 패턴 검사와 비슷합니다. 실습에서 쓴 Suricata 규칙을 한 줄 뜯어 보겠습니다.

```text
drop tls $HOME_NET any -> $EXTERNAL_NET any (tls.sni; content:"example.com"; endswith; msg:"IDS-IPS lab: block example.com"; sid:1000001; rev:1;)
```

| 부분 | 값 | 뜻 |
|---|---|---|
| 동작 (action) | `drop` | 맞으면 패킷을 버리고 경보를 남깁니다. `alert`면 경보만 남깁니다 |
| 머리 (header) | `tls $HOME_NET any -> $EXTERNAL_NET any` | 내부에서 외부로 나가는 TLS 연결이 대상입니다 |
| 옵션 (options) | `tls.sni; content:"example.com"; endswith;` | 접속하려는 도메인 이름이 example.com으로 끝나면 일치로 봅니다 |
| | `msg`, `sid`, `rev` | 경보 메시지, 규칙 번호, 규칙 버전입니다 |

Suricata 공식 문서도 규칙을 이 세 부분(action, header, rule options)으로 설명합니다.

제가 이해한 이상 탐지 기반은 평소의 모습을 먼저 배우는 방식입니다. 이 서버가 평소 어느 나라와 통신하는지, 어떤 API를 몇 번쯤 부르는지 같은 것들입니다. 그리고 거기서 크게 벗어나는 행동을 잡습니다.

| | 시그니처 기반 | 이상 탐지 기반 |
|---|---|---|
| 잘 잡는 것 (내 이해) | 이미 알려진 공격 | 처음 보는 공격, 내부자의 이상 행동 |
| 오탐 경향 (내 이해) | 규칙이 구체적이면 적은 편 | 평소와 다르다고 다 공격은 아니어서 많아지기 쉬움 |
| 미탐 경향 (내 이해) | 규칙에 없는 공격은 놓침 | 평소처럼 위장한 공격은 놓치기 쉬움 |
| 운영 부담 (내 이해) | 규칙을 계속 갱신해야 함 | 평소를 배우는 기간과 튜닝이 필요함 |
| AWS에서 | Network Firewall 규칙 (실습에서 Suricata 형식 규칙을 직접 넣어 동작 확인) | GuardDuty (위협 인텔리전스와 머신러닝 모델) |

AWS 문서에 따르면 GuardDuty는 CloudTrail 관리 이벤트, VPC 흐름 로그, DNS 로그를 분석하고, 위협 인텔리전스 목록과 머신러닝 모델을 함께 씁니다. 그래서 GuardDuty에는 두 방식이 섞여 있다고 이해했습니다. 위협 인텔리전스 목록과 맞춰 보는 것은 시그니처 쪽, 머신러닝 모델로 평소와 다른 행동을 잡는 것은 이상 탐지 쪽으로 볼 수 있다고 생각합니다.

## 5. IDS와 IPS의 차이 — 경로 밖이냐, 경로 안이냐

![위쪽은 경로 밖에서 복사본을 받아 경보만 보내는 IDS, 아래쪽은 경로 한가운데에서 악성 패킷을 버리는 IPS]({{ '/assets/img/posts/ids-ips-inline-vs-passive.svg' | relative_url }})

이 그림이 이 글에서 가장 중요합니다. 그림의 IDS는 통신 경로 밖에서 복사본을 받습니다. 그래서 악성 패킷을 발견해도 원래 패킷이 서버로 가는 것을 직접 멈추지 못합니다. 경로 밖 IDS가 스스로 할 수 있는 일은 알리는 것까지입니다. IDS 기능을 경로 안 장비에서 경보 규칙으로 구현할 수도 있는데, 7장 실습의 Network Firewall `alert` 규칙이 그런 예입니다. IPS는 통신 경로 안에 서 있습니다. 모든 패킷이 IPS를 지나야 서버로 갈 수 있으니, 나쁜 패킷은 그 자리에서 버릴 수 있습니다.

| 비교 항목 (내 정리) | IDS | IPS |
|---|---|---|
| 위치 | 주로 경로 밖 (미러링, 로그 분석). 경로 안 장비의 경보 규칙으로도 가능 | 경로 안 (인라인) 이어야 직접 차단 가능 |
| 대응 | 경보, 기록 | 차단 + 경보, 기록 |
| 통신 속도에 주는 영향 | 경로 밖이면 없음 (복사본만 봄) | 있을 수 있음 (모든 패킷이 검사를 거침) |
| 장비가 멈추면 | 경로 밖 센서라면 탐지만 멈춤 | 구성에 따라 통신이 끊기거나(fail-closed), 검사 없이 통과함(fail-open) |
| 오탐이 나면 | 쓸데없는 경보 하나 | 정상 사용자가 차단됨 (장애) |
| AWS에서 | 경로 밖: GuardDuty, Traffic Mirroring + Suricata / 경로 안에서 경보만: Network Firewall의 `alert` 규칙 | Network Firewall의 `drop` 규칙, AWS WAF의 block |

내 생각: 표를 정리하고 보니, IPS의 장점인 막을 수 있다는 점과 단점인 오탐이 곧 장애라는 점이 같은 성질에서 나온다는 것을 알았습니다. 그래서 실제 운영에서는 새 규칙을 먼저 `alert`로 걸어 두고, 오탐이 없는 것을 확인한 다음 `drop`으로 바꾸는 순서가 자연스러워 보입니다. 7장 실습에서 규칙 두 개를 하나는 `drop`, 하나는 `alert`로 넣은 것도 이 차이를 한 장비 안에서 비교해 보려는 의도였습니다.

## 6. AWS에서는 누가 무엇을 하나

| 서비스 | 위치 | 하는 일 | IDS/IPS로 보면 |
|---|---|---|---|
| 보안 그룹, NACL | 인스턴스·서브넷 경계 | IP·포트·프로토콜 규칙 | 방화벽에 가까움 (IDS/IPS 아님, 내 이해) |
| GuardDuty | 경로 밖 (로그 분석) | CloudTrail 관리 이벤트·VPC 흐름 로그·DNS 로그에서 위협을 찾아 탐지 결과를 냄 | IDS (호스트형은 Runtime Monitoring) |
| Traffic Mirroring + Suricata | 경로 밖 (복사본) | 패킷 내용을 규칙으로 검사 | NIDS |
| Network Firewall | 경로 안 (라우팅으로 끼워 넣음) | Suricata 형식 규칙으로 검사, `drop`이면 차단 (실습에서 확인) | NIPS (`alert` 규칙만 쓰면 NIDS처럼 동작) |
| AWS WAF | 보호 대상 웹 리소스 앞 | HTTP(S) 요청을 모니터링하고 접근을 제어 | 웹 요청 단위의 IPS에 가깝다고 이해 |

Network Firewall은 만든다고 바로 트래픽을 보지 않습니다. AWS 문서는 VPC 라우팅 테이블을 고쳐서, 보호할 서브넷과 바깥 사이에 방화벽이 끼도록 하라고 안내합니다. 7장에서 실제로 해 보니 이 라우팅 작업이 실습에서 가장 중요한 부분이었습니다.

## 7. 직접 해 보기 — 경보만 하는 IDS, 실제로 막는 IPS

실습은 서울 리전(ap-northeast-2)에서 했습니다. 두 가지를 했습니다.

- 실습 A: GuardDuty 샘플 탐지로 IDS가 경보만 내는 모습을 봅니다.
- 실습 B: Network Firewall에 Suricata 규칙을 넣고, IPS가 실제로 연결을 끊는 모습을 로그로 확인합니다.

### 실습 A. GuardDuty — 탐지는 하지만 막지는 않는다

GuardDuty에는 실제 공격 없이 탐지 결과를 만들어 보는 기능이 있습니다. 공격 단계별로 하나씩, 샘플 세 개를 만들었습니다.

```bash
aws guardduty create-sample-findings \
  --detector-id <탐지기 ID> \
  --finding-types 'Recon:EC2/PortProbeUnprotectedPort' \
                  'UnauthorizedAccess:EC2/SSHBruteForce' \
                  'Backdoor:EC2/C&CActivity.B!DNS'
```

명령을 처음 실행했을 때 `bash: !DNS: event not found`라는 오류가 났습니다. bash가 큰따옴표 안의 `!`를 이전 명령을 다시 부르는 기호로 읽은 것으로 보입니다. 작은따옴표로 감싸니 해결됐습니다.

| 종류 | 공격 단계 | 심각도 |
|---|---|---|
| Recon:EC2/PortProbeUnprotectedPort | 정찰 — 열린 포트를 찔러 봄 | 낮음 (2.0) |
| UnauthorizedAccess:EC2/SSHBruteForce | 침입 시도 — SSH 비밀번호 대입 | 낮음 (2.0) |
| Backdoor:EC2/C&CActivity.B!DNS | 침입 후 — 알려진 C&C 서버 도메인 조회 | 높음 (8.0) |

![GuardDuty 결과 목록. [샘플]로 시작하는 탐지 3건이 심각도와 함께 보인다]({{ '/assets/img/posts/ids-ips-cap-01-gd-list.png' | relative_url }})

AWS 문서대로 샘플 탐지는 제목이 [SAMPLE]로 시작하고, 이번에 쓴 한국어 콘솔 화면에서는 캡처처럼 [샘플]로 표시됐습니다. 목록 아래쪽에 가린 두 건은 이 실습과 상관없는 실제 기록입니다.

![C&C 탐지의 상세 패널 윗부분. 심각도 높음, 대상 인스턴스 i-99999999]({{ '/assets/img/posts/ids-ips-cap-02-gd-detail.png' | relative_url }})

![C&C 탐지의 상세 패널 아랫부분. Action type DNS_REQUEST, Blocked false, Sample true]({{ '/assets/img/posts/ids-ips-cap-02-gd-detail-2.png' | relative_url }})

상세 화면에서 눈여겨볼 줄은 `Blocked: false` 입니다. GuardDuty는 이 인스턴스가 C&C 도메인을 조회했다는 것을 알려 주고, 그 조회는 막히지 않았다고(`Blocked: false`) 표시합니다. 로그를 분석해 탐지 결과를 내는 서비스라서 그렇다고 이해했습니다. 막으려면 탐지 결과를 이용한 별도 대응을 붙여야 할 것으로 생각합니다. 이 부분은 직접 확인하지 못했습니다.

### 실습 B. Network Firewall — 경로 한가운데에서 끊는다

![실습 구성도. EC2의 트래픽이 방화벽 엔드포인트, NAT 게이트웨이, 인터넷 게이트웨이를 차례로 지나고, 로그는 CloudWatch Logs로 간다]({{ '/assets/img/posts/ids-ips-aws-lab.svg' | relative_url }})

구성도의 번호 순서대로 트래픽이 흐릅니다.

1. 공인 IP가 없는 EC2(작업 서브넷)에서 `curl`을 보냅니다. EC2에는 SSM으로 접속했습니다.
2. 작업 서브넷의 기본 경로가 방화벽 엔드포인트를 가리키므로, 이 실습에서 인터넷으로 나가는 트래픽은 Network Firewall을 지납니다(VPC 안끼리의 통신은 local 경로를 탑니다). 여기서 Suricata 규칙 두 개로 검사합니다.
3. 검사를 통과한 트래픽은 방화벽 서브넷의 경로를 따라 NAT 게이트웨이로 갑니다.
4. NAT 게이트웨이가 인터넷 게이트웨이를 거쳐 인터넷으로 내보냅니다.
5. 돌아오는 응답도 방화벽을 지나야 합니다. 공인 서브넷 라우팅 테이블에 작업 서브넷(172.31.64.0/24)으로 가는 트래픽을 방화벽 엔드포인트로 보내는 경로를 하나 더 넣었습니다. 상태 저장 규칙은 한 연결의 양방향 트래픽을 함께 봐야 한다고 이해해서, 갈 때와 올 때 모두 방화벽을 지나도록 했습니다.
6. 규칙에 걸린 트래픽(alert 로그)과 모든 연결 기록(flow 로그)은 CloudWatch Logs로 보냈습니다.

라우팅 테이블 세 개를 콘솔에서 확인했습니다.

![rt-work 라우팅. 0.0.0.0/0의 대상이 방화벽 엔드포인트 vpce-0e664816f12c2361f]({{ '/assets/img/posts/ids-ips-cap-06-rt-work.png' | relative_url }})

![rt-fw 라우팅. 0.0.0.0/0의 대상이 NAT 게이트웨이]({{ '/assets/img/posts/ids-ips-cap-07-rt-fw.png' | relative_url }})

![rt-pub 라우팅. 0.0.0.0/0은 인터넷 게이트웨이, 172.31.64.0/24는 방화벽 엔드포인트]({{ '/assets/img/posts/ids-ips-cap-08-rt-pub.png' | relative_url }})

방화벽에는 규칙 그룹 하나를 연결했고, 규칙은 두 줄입니다.

```text
drop tls $HOME_NET any -> $EXTERNAL_NET any (tls.sni; content:"example.com"; endswith; msg:"IDS-IPS lab: block example.com"; sid:1000001; rev:1;)
alert http $HOME_NET any -> $EXTERNAL_NET any (http.uri; content:"/ids-ips-test"; msg:"IDS-IPS lab: test URI"; sid:1000002; rev:1;)
```

- 1000001번 규칙은 IPS처럼 동작합니다. SNI가 example.com으로 끝나는 TLS 연결을 끊습니다.
- 1000002번 규칙은 IDS처럼 동작합니다. URI에 `/ids-ips-test`가 들어간 HTTP 요청을 통과시키고 경보만 남깁니다.

![방화벽 개요. 상태 준비됨, 정책 ids-ips-lab-policy, 기본 VPC에 연결]({{ '/assets/img/posts/ids-ips-cap-03-nfw-firewall.png' | relative_url }})

![방화벽 엔드포인트. ap-northeast-2a의 방화벽 서브넷에 vpce-0e664816f12c2361f가 준비됨]({{ '/assets/img/posts/ids-ips-cap-03-nfw-firewall-2.png' | relative_url }})

![방화벽 정책. 상태 저장 규칙 그룹 ids-ips-lab-rules, 용량 100]({{ '/assets/img/posts/ids-ips-cap-05-nfw-policy.png' | relative_url }})

#### 결과 — 무엇이 통과하고 무엇이 막혔나

EC2에서 보낸 요청과 결과입니다(시각은 UTC).

```text
07:19:35Z curl https://aws.amazon.com          → http=200   (대조군, 통과)
07:19:36Z curl https://example.com             → curl: (28) Connection timed out after 10002 milliseconds
07:19:46Z curl https://www.example.com         → curl: (28) Connection timed out after 10002 milliseconds
07:19:56Z curl http://neverssl.com/ids-ips-test → http=404   (통과, 404의 원인은 아래 설명)
07:20:36Z 평문 HTTP로 example.com 요청        → http=200   (통과)
```

example.com 두 건은 응답 없이 10초 뒤 시간 초과가 났습니다. 방화벽 로그의 판정이 drop이었고, 클라이언트는 거절 응답 없이 기다리다 시간 초과가 났습니다. 방화벽이 패킷을 조용히 버린 것으로 보입니다. neverssl.com 요청은 방화벽을 지나 서버에서 404 응답을 받았습니다. 방화벽 로그의 판정도 drop이 아니라 alert였으므로 막힌 것은 아닙니다. 마지막 줄은 같은 example.com이라도 평문 HTTP로 요청하면 통과한다는 것을 보여 줍니다. 1000001번 규칙이 TLS 연결의 SNI만 보는 규칙이라서 그런 것으로 보입니다. 이 요청은 어느 규칙에도 걸리지 않아 alert 로그에 남지 않았습니다. 404가 나온 구체적인 이유는 이 기록만으로는 확인하지 못했고, 테스트용으로 지어낸 경로라 서버에 그런 페이지가 없었기 때문으로 보입니다.

방화벽 쪽 기록은 CloudWatch Logs Insights로 확인했습니다.

![Logs Insights 결과. blocked 4건(sid 1000001, example.com, www.example.com)과 allowed 2건(sid 1000002, neverssl.com)]({{ '/assets/img/posts/ids-ips-cap-09-logs-insights.png' | relative_url }})

| 시각 (KST) | 동작 | 규칙 | 대상 |
|---|---|---|---|
| 16:19:36 | blocked | 1000001 | example.com |
| 16:19:42 | blocked | 1000001 | example.com |
| 16:19:46 | blocked | 1000001 | www.example.com |
| 16:19:52 | blocked | 1000001 | www.example.com |
| 16:19:59 | allowed | 1000002 | neverssl.com/ids-ips-test |
| 16:20:07 | allowed | 1000002 | neverssl.com/ids-ips-test |

차단된 이벤트 하나를 열어 보면 이렇습니다(필요한 필드만 남김).

```json
{
  "firewall_name": "ids-ips-lab-fw",
  "event": {
    "event_type": "alert",
    "app_proto": "tls",
    "src_ip": "172.31.64.130", "dest_ip": "172.66.147.243", "dest_port": 443,
    "alert": { "signature_id": 1000001, "signature": "IDS-IPS lab: block example.com", "action": "blocked" },
    "verdict": { "action": "drop" },
    "tls": { "sni": "example.com", "version": "TLS 1.3" },
    "pkt_src": "geneve encapsulation",
    "timestamp": "2026-11-23T07:19:36.073873+0000"
  }
}
```

통과시킨 이벤트는 `"action": "allowed"`, `"verdict": { "action": "alert" }`이고, `http.hostname`에 neverssl.com, `http.url`에 `/ids-ips-test`가 남았습니다.

로그에서 알게 된 점이 세 가지 있습니다.

- 요청 한 번에 경보가 두 줄씩 남았습니다. curl이 도메인의 IP 주소 두 개에 차례로 연결을 시도했기 때문으로 보입니다. 예를 들어 example.com은 172.66.x.x와 104.20.x.x로 각각 한 번씩 막혔습니다. neverssl.com은 IP가 같은데도 두 줄이 남았는데, 이 원인은 확인하지 못했습니다.
- 암호화된 HTTPS인데도 도메인으로 막을 수 있었습니다. 이번 실습에서는 로그에 `tls.sni`로 남은 접속 도메인 이름(SNI)을 기준으로 차단했습니다. HTTPS의 URI와 본문을 복호화해 검사하는 구성과, SNI를 암호화하는 ECH를 쓸 때의 동작은 이번에 확인하지 못했습니다. 그래서 URI 규칙(1000002)은 평문 HTTP로 시험했습니다.
- `pkt_src: geneve encapsulation` 이라는 필드가 있습니다. 방화벽 엔드포인트가 트래픽을 Geneve라는 터널 형식으로 감싸서 받는다는 뜻으로 보입니다. 사용자가 보지 못하는 곳에서 트래픽이 검사 장비로 옮겨지고 있다는 흔적입니다. 다만 이 부분은 문서로 확인하지는 않았습니다.

실습 비용은 방화벽 엔드포인트, NAT 게이트웨이, t3.micro 사용 시간만큼 나왔습니다. 끝난 뒤 만든 순서의 반대로 모두 지웠습니다.

## 8. 한계와 내 생각

- 오탐 피로: IDS는 경보가 너무 많으면 아무도 보지 않게 됩니다. IPS는 오탐이 곧 장애입니다. 두 경우 모두 규칙을 튜닝하는 사람의 시간이 가장 큰 비용이라고 생각합니다.
- 암호화 트래픽: 이번 실습 구성에서는 네트워크형이 HTTPS의 내용을 보지 못했습니다. SNI까지 암호화하는 ECH가 널리 쓰이면 도메인 기반 차단도 어려워질 것으로 생각합니다. 그래서 호스트형(GuardDuty Runtime Monitoring 같은 에이전트)이나 TLS를 푸는 지점(ALB + WAF)에서 검사하는 비중이 커질 것 같습니다.
- 경로 안에 있다는 위험: Network Firewall이 멈추거나 라우팅을 잘못 고치면 서브넷 전체의 인터넷 통신이 끊길 수 있다고 생각합니다. 실습 중에도 경로 하나(⑤)를 빼먹으면 응답이 돌아오지 않는 구조였습니다.
- 관리형 서비스는 블랙박스: GuardDuty가 왜 그 판단을 했는지는 결과 화면에 나온 정보만큼만 알 수 있습니다. 직접 쓴 Suricata 규칙은 왜 막혔는지 한 줄로 설명할 수 있었던 것과 대비됩니다.
- 탐지 다음 단계: GuardDuty 결과를 이벤트로 받아 보안 그룹을 바꾸는 자동화를 붙이면, IDS에 자동 대응을 더해 IPS와 비슷한 효과를 낼 수 있을 것이라고 생각합니다. 아직 직접 만들어 보지는 않았습니다. 다만 이 방식은 이미 일이 벌어진 뒤에 대응한다는 점에서 경로 안의 IPS와 다를 것입니다.

## 9. 배운 점과 앞으로 할 것

- 배운 점: IDS와 IPS는 검사 방법보다 대응(경보냐 직접 차단이냐)으로 갈리고, 직접 차단하려면 트래픽이나 그 동작을 제어할 수 있는 위치에 있어야 합니다. 같은 Network Firewall 안에서도 규칙의 동작을 `alert`로 쓰느냐 `drop`으로 쓰느냐에 따라 IDS가 되기도 하고 IPS가 되기도 했습니다.
- 내 프로젝트와 연결: 만들고 있는 QEMU 감시 도구도 탐지 → 봉쇄 구조입니다. 탐지만 켜 두고 오탐을 확인한 뒤 봉쇄를 켜는 순서는 이번 글의 `alert → drop` 순서와 같은 이유로 필요하다고 정리했습니다.
- 다음에 공부할 것:
  - Suricata 규칙을 더 써 보기 (flowbits, threshold로 무차별 대입 잡기)
  - Traffic Mirroring + Suricata로 경로 밖 NIDS를 직접 구성해 Network Firewall과 비교하기
  - EKS에서 GuardDuty Runtime Monitoring이 컨테이너 안의 행위를 어떻게 잡는지 확인하기
  - NIST SP 800-94는 2007년 문서라서, 클라우드 환경을 다룬 최신 자료로 보완하기

## 참고

- NIST, [SP 800-94 Guide to Intrusion Detection and Prevention Systems (IDPS)](https://csrc.nist.gov/pubs/sp/800/94/final), 2007-02
- Suricata 문서, [Rules Format](https://docs.suricata.io/en/latest/rules/intro.html)
- AWS, [What is Amazon GuardDuty?](https://docs.aws.amazon.com/guardduty/latest/ug/what-is-guardduty.html)
- AWS, [GuardDuty Runtime Monitoring](https://docs.aws.amazon.com/guardduty/latest/ug/runtime-monitoring.html)
- AWS, [What is Amazon Inspector?](https://docs.aws.amazon.com/inspector/latest/user/what-is-inspector.html)
- AWS, [Generating sample findings in GuardDuty](https://docs.aws.amazon.com/guardduty/latest/ug/sample_findings.html)
- AWS, [High-level steps for implementing AWS Network Firewall](https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-high-level-steps.html)
- AWS, [Logging network traffic from AWS Network Firewall](https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-logging.html)
- AWS, [What is Traffic Mirroring?](https://docs.aws.amazon.com/vpc/latest/mirroring/what-is-traffic-mirroring.html)
- AWS, [AWS WAF](https://docs.aws.amazon.com/waf/latest/developerguide/waf-chapter.html)
