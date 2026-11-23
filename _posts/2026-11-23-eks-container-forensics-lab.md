---
title: "[기술문서] AWS EKS 컨테이너 포렌식 — 랩을 직접 짓고 공격 흔적을 증거로 남기기"
category: tech-docs
sub: "AWS"
description: "팀 프로젝트에서 EKS 위에 취약한 앱을 올리고 9단계 공격을 재현한 뒤, 로그·데이터·메모리에 남은 흔적만으로 공격 과정을 다시 맞춰 본 과정을 실제 명령과 기록으로 정리합니다."
---

이 글에 나오는 AWS 계정 번호, 공인 IP, 리소스 ID, 팀원 계정 이름은 가렸습니다. 랩 안의 사설 IP(10.84.x.x)는 공격 흐름을 따라가는 데 필요해서 그대로 두었습니다. 랩 데이터는 모두 가짜 값입니다.

## 1. 이 활동을 하게 된 계기

컨테이너 포렌식 팀 프로젝트에 참여했습니다.
컨테이너는 수명이 짧습니다. 사고가 나면 파드는 이미 새것으로 바뀌어 있고, 서버용 포렌식 방법은 그대로 들어맞지 않습니다. 클라우드 보안을 공부하는 입장에서 사고가 난 뒤에 무엇이 남고 무엇이 사라지는지 직접 확인해 보고 싶었습니다.

우리가 증명하고 싶었던 것은 한 문장이었습니다. 이 컨테이너에서, 이 시각에, 이 행위가 있었다.

## 2. 시작하기 전 처음 질문

| 질문 | 시작 전 내 생각 |
|---|---|
| 컨테이너 사고의 증거는 어디에 남을까? | CloudTrail을 보면 다 나올 것 같다 |
| 파드가 재시작되면 무엇이 사라질까? | 전부 사라질 것 같다 |
| 팀이 AWS 계정 하나를 같이 쓰면 서로 영향은 없을까? | 각자 조심하면 될 것 같다 |
| 증거를 모았다는 것을 어떻게 믿게 할까? | 캡처를 남기면 될 것 같다 |

## 3. 어떻게 했고 어떤 결과가 나왔나

진행 순서는 이렇습니다.

1. EC2로 작게 해 보기
2. EKS 랩을 격리해서 짓고, 공격과 수집 장치를 하나씩 붙이기
3. 멘토님 피드백으로 컨테이너 중심 수집으로 바꾸기
4. 정답지를 먼저 적고 9단계 공격을 재현한 뒤, 증거만으로 다시 맞추기

### 3-1. EC2에서 먼저 작게 해 봤습니다

AWS를 처음 쓰는 상태라, 먼저 EC2 두 대(공격 대상 web, 접속용 jump)를 만들고 web에 Docker로 취약한 웹을 올렸습니다. 공격하기 전에 기록 장치부터 켰습니다.

| 기록 장치 | 무엇을 보나 |
|---|---|
| CloudTrail (다중 리전, 무결성 검증) | 누가 어떤 AWS API를 불렀나 |
| S3 데이터 이벤트 | 미끼 버킷의 객체를 누가 읽었나 |
| VPC Flow Logs | 어디서 어디로 얼마나 통신했나 |
| CloudWatch Logs | 웹 컨테이너가 받은 요청 내용 |

미끼로 S3 버킷에 가짜 `db-password.txt`, `api-keys.json`을 넣고, 웹 서버의 IAM 역할에는 그 버킷을 읽을 권한을 줬습니다. 웹 앱은 입력을 셸에 그대로 넘기는 명령 주입 취약점 하나만 있는 Flask 앱입니다.

공격은 명령 주입으로 컨테이너에 들어가서, 인스턴스 메타데이터에서 웹 서버 역할의 임시 자격 증명을 꺼내고, 그 자격 증명으로 미끼 파일을 가져가는 흐름이었습니다.

그다음 아무 정보가 없다고 가정하고 거꾸로 따라갔습니다. CloudTrail 관리 이벤트로 자산을 찾고, 데이터 이벤트에서 GetObject를 찾고, 웹 앱 로그에서 주입된 입력을 찾고, Flow Logs로 출발지를 찾고, SSM 기록으로 실행한 명령을 확인했습니다. 피해 범위는 미끼 파일 1개로 정리했습니다.

여기서 세 가지를 배웠습니다.

- 훔친 역할을 그 서버 안에서 그대로 쓰면, CloudTrail에 찍히는 IP가 원래 서버와 같아서 IP로는 이상하다고 알 수 없었습니다. 웹 앱 로그와 S3 데이터 이벤트를 맞춰 봐야 했습니다.
- CloudTrail은 SSM으로 실행한 셸 명령의 내용을 가려서 보여 줍니다. 명령 내용은 SSM 기록 쪽으로 넘어가서 봐야 합니다.
- CloudTrail은 어떤 키가 S3를 읽었는지는 알려 주지만, 그 키가 컨테이너 안의 어느 프로세스에서 나왔는지는 알려 주지 않습니다. 로그만으로는 중간이 끊깁니다. 그 끊긴 부분을 메우는 것이 메모리입니다.

### 3-2. EKS 랩은 격리부터 정했습니다

팀이 AWS 계정 하나를 같이 썼기 때문에, 짓기 전에 세 가지를 정했습니다.

1. 내 API 호출은 계정 전체 CloudTrail에 남습니다. 숨길 수 없으니 사용자 이름으로 걸러서 보기로 했습니다.
2. 클러스터는 각자 만들었습니다. 포렌식을 하면서 노드를 스냅샷하는데, 클러스터를 같이 쓰면 남의 파드까지 건드리게 되기 때문입니다. 클러스터를 나누면 audit 로그 그룹과 VPC도 클러스터 이름으로 자연스럽게 나뉩니다.
3. 모든 자원에 내 이름 접두사와 `owner`, `project` 태그를 붙였습니다. 나중에 정리할 때 내 자원과 팀원 자원을 정확히 구분할 수 있었습니다.

### 3-3. 사건을 만들고, 사건을 볼 눈을 하나씩 붙였습니다

로깅을 아무리 켜도 아무 일이 없으면 분석할 것이 없습니다. 그래서 공격당할 앱부터 올렸습니다. 이미지 빌드 없이 ConfigMap과 공식 Python 이미지로 배포해서, 팀원도 `kubectl apply` 한 번으로 같은 환경을 만들 수 있게 했습니다.

```bash
kubectl apply -f lab/shop-web-vuln.yaml     # 네임스페이스, SA, ConfigMap, Deployment, Service
curl "http://localhost:8080/track?host=<주소>%3B%20id"   # 주소 뒤에 ;id 를 붙여 명령을 끼워 넣는다
# → 화면에 uid=0(root)
```

주입이 실제로 되고, 컨테이너가 root로 돌고 있었습니다. 이제 사건이 생겼습니다. 그다음은 이 사건을 볼 눈입니다.

첫 번째 눈은 Falco입니다. 클러스터 안에서만 도는 DaemonSet이라 AWS 설정을 바꾸지 않고, 팀원에게도 영향이 없습니다.

```bash
helm install falco falcosecurity/falco -n falco --create-namespace \
  --set driver.kind=modern_ebpf          # 커널 모듈 없이 eBPF로 시스템 콜 감시

kubectl exec -n shop deploy/shop-web -- cat /etc/shadow      # 일부러 규칙을 건드려 본다
kubectl logs -n falco -l app.kubernetes.io/name=falco -c falco | grep shadow
```

경보 한 줄에 조사에 필요한 식별자가 함께 나왔습니다.

```text
container_id=c96a********  k8s_pod_name=shop-web-...  k8s_ns_name=shop  user_uid=0  command=cat /etc/shadow
```

두 번째 눈은 EKS audit 로그입니다. 파드의 ServiceAccount 토큰으로 쿠버네티스 API를 찔러 보는 행위는 컨테이너 밖(컨트롤 플레인)에서 일어나서 Falco에 보이지 않습니다. EKS는 관리형이라 내보내기만 켜면 됩니다.

```bash
aws eks update-cluster-config --name <내 클러스터> \
  --logging '{"clusterLogging":[{"types":["audit"],"enabled":true}]}'   # 비용을 아끼려 audit만
```

### 3-4. 멘토님 피드백으로 방향을 바꿨습니다

처음에는 AWS 서비스 로그에 치우쳐 있었습니다. 멘토님이 컨테이너에 맞는 수집을 하라고 피드백을 주셨고, 그 뒤로 다음을 단계별로 직접 해 봤습니다.

- kubectl 등 컨테이너 환경에 맞는 명령으로 휘발성 증거(프로세스, 네트워크 연결)부터 모으기
- 컨테이너 프로세스를 죽이고 파드를 바꿔 보며 무엇이 사라지는지 실험하기
- 수집한 증거 묶음의 해시를 검증하고, S3 Object Lock(COMPLIANCE 모드)에 보관해 삭제가 거부되는 것을 확인하기
- SSH 없이 SSM으로 노드에서 로그를 모으기

### 3-5. 정답지를 먼저 적고 공격했습니다

마지막 단계는 셀프 검증 랩이었습니다. 방법은 이렇습니다.

1. 공격하는 쪽이 단계마다 시각, 주체, 명령을 먼저 정답지에 적습니다.
2. 단계마다 모든 수집원을 훑어 증거를 모읍니다.
3. 정답지를 뺀 증거만 보고 공격 과정을 다시 맞춥니다.
4. 맞추지 못한 부분이 곧 수집 체계의 빈틈입니다.

환경은 팀원이 만든 랩의 CloudFormation 템플릿으로, 같은 팀 공유 계정 안에 내 클러스터를 따로 만들어 썼습니다. 네임스페이스만 나누면 EKS audit 로그가 섞여 정답지와 대조하기 어렵기 때문입니다.

| 구성 | 역할 |
|---|---|
| victim-a | 명령 주입 취약점이 있는 리스너 파드. 이번에 재시작해 볼 쪽 |
| victim-b | 같은 구성. 재시작하지 않고 비교용으로 둠 |
| mock-sink | 유출 데이터를 받는 클러스터 안 모의 수신처 (외부로는 안 나감) |
| attacker | 공격자 역할 파드. victim-a와 다른 노드에 둠 |
| 과다 권한 Role | victim의 ServiceAccount에 pods get/list, pods/exec create, secrets get(목록 조회는 없음)을 줌 |
| NetworkPolicy | victim은 mock-sink의 8080으로만 나갈 수 있음 |

공격자 파드를 victim-a와 다른 노드에 둔 데는 이유가 있습니다. 같은 노드에 있으면 VPC CNI에서 통신이 노드의 네트워크 인터페이스(ENI)를 거치지 않아서 Flow Logs에 아무것도 남지 않습니다.

켠 수집원은 이렇습니다.

| 수집원 | 무엇을 보나 |
|---|---|
| EKS 로그 5종 (api, audit, authenticator, controllerManager, scheduler) | 쿠버네티스 API 호출 |
| VPC Flow Logs | 노드 사이 통신 |
| Container Insights | 컨테이너 stdout 로그를 CloudWatch로 모음 |
| Falco | 컨테이너 안 시스템 콜 |
| GuardDuty (EKS Audit + Runtime Monitoring) | 관리형 위협 탐지 |
| CloudTrail | AWS API 호출 |
| AWS Config, Route 53 DNS 쿼리 로깅, S3 | 공격 중간(③ 이후)에 켬 |

### 3-6. 9단계 공격과 각 단계에 남은 흔적

| 단계 | 공격 | 흔적이 남은 곳 | 흔적이 없던 곳 |
|---|---|---|---|
| ① 명령 주입 | 리스너에 `/run?cmd=id` | Container Insights, Flow Logs | EKS Audit, CloudTrail, GuardDuty, Falco |
| ② 토큰 탈취 | SA 토큰 읽기 | Container Insights (명령 문자열만) | 확인한 로그에 토큰 값은 없음 |
| ③ 측면 이동 | 탈취 토큰으로 victim-b에 exec | EKS Audit 32건, Falco 34건, Flow Logs | CloudTrail, GuardDuty |
| ④ 탐색 | secrets 목록 조회 | EKS Audit (403 거부) | |
| ⑤ 데이터 변조 | CSV에 행 추가 | Container Insights, EKS Audit, Falco, Flow Logs | |
| ⑥ 압축 | tar.gz로 묶기 | Container Insights | |
| ⑦ 유출 | mock-sink로 전송 | Flow Logs, Container Insights | |
| ⑧ 로그 훼손 | 로그 줄 지우기 | Container Insights, EKS Audit, Falco | 지운 줄의 원래 내용 |
| ⑨ 재시작 | victim-a 파드 삭제 | EKS Audit, CloudTrail(스냅샷), Container Insights | |

몇 단계는 실제 기록을 보면 더 잘 이해됩니다.

① 명령 주입. 리스너 로그에 공격자 파드 IP와 명령이 그대로 남았습니다.

```text
[2026-11-18T11:17:25.359121Z] src=10.84.11.99 cmd=id
10.84.11.99 - "GET /run?cmd=id HTTP/1.1" 200 -
```

Container Insights에는 1~2분 안에 올라왔지만, Flow Logs는 약 15분 뒤에야 보였습니다. 그리고 Flow Logs의 도착지는 파드 IP(10.84.10.100)가 아니라 노드 ENI의 기본 IP(10.84.10.4)로 찍혀서, 파드 IP로 검색하면 0건이 나왔습니다. 로그를 검색할 때 어떤 주소로 남는지 먼저 알아야 한다는 것을 배웠습니다.

② 토큰 탈취. 공개 글과 증거에 토큰 원문이 남지 않도록, 토큰 평문 대신 해시와 길이, 일부 claims만 기록했습니다.

```bash
SAP=/var/run/secrets/kubernetes.io/serviceaccount
echo "TOKEN_SHA256=$(sha256sum $SAP/token | cut -d" " -f1)"
grep serviceaccount /proc/mounts
# tmpfs /run/secrets/kubernetes.io/serviceaccount tmpfs ro,...,noswap
```

토큰은 tmpfs(메모리)에 noswap으로 마운트되어 있었습니다. tmpfs는 메모리 위의 파일 시스템이고 noswap이라 스왑으로도 내려가지 않습니다. 그래서 토큰을 증거로 잡으려면 메모리 쪽을 먼저 봐야 한다고 판단했습니다. 다만 토큰이 다른 경로로 디스크에 복사됐는지까지는 이번에 확인하지 못했습니다.

③ 측면 이동. EKS Audit에 exec 요청이 명령과 함께 남았고, 어떤 RoleBinding 때문에 허용됐는지도 같이 나왔습니다.

```text
11:44:24.298Z get 101 /api/v1/namespaces/<ns>/pods/sc01-victim-b-.../exec?command=id&container=listener
(decision=allow, reason: RBAC: allowed by RoleBinding "sc01-victim-overpriv-binding")
```

Falco는 공격자 파드에서 이미지에 없던 `/tmp/kubectl`이 실행된 것을 Critical로 잡았습니다. 반대로 CloudTrail에는 아무것도 남지 않았습니다. 쿠버네티스 ServiceAccount의 API 호출은 AWS API가 아니어서 CloudTrail에 기록되지 않습니다.

④ 탐색. secrets는 get은 되지만 list는 안 되게 권한을 줬습니다. 목록 조회는 403으로 거부되어 EKS Audit에 `decision=forbid`로 남았습니다. 접근 권한이 있다는 것과 실제로 열람했다는 것은 다르다는 점을 기록으로 구분할 수 있었습니다.

⑤~⑦ 변조, 압축, 유출. 데이터가 바뀐 것은 해시로 확인했습니다.

| 파일 | 공격 전 | 공격 후 |
|---|---|---|
| data/sample.csv | `4e7d5cf5…` | `2c70653e…` (행 1개 추가) |
| exfil.tar.gz (보낸 쪽) | | `a0fe689a…` (214B) |
| mock-sink가 받은 파일 | | `a0fe689a…` (214B, 일치) |

보낸 파일과 받은 파일의 해시가 같았고, 받은 파일의 압축을 열어 변조된 CSV가 들어 있는 것을 확인했습니다. 그래서 무엇이 유출됐는지 정확히 말할 수 있었습니다.

⑧ 로그 훼손. `grep -v`로 로그 파일에서 특정 줄을 지웠습니다. 지운 뒤 해시가 바뀐 것은 알 수 있지만, 해시만으로는 지워진 줄의 원래 내용을 되살릴 수 없습니다. 그 로그 파일은 영구 볼륨(PVC)에 쓰는 파일이라 stdout을 모으는 Container Insights에도 원문이 없었습니다.

⑨ 재시작. 파드를 지우기 전에 EBS 스냅샷부터 떴고, 이 작업은 CloudTrail에 `CreateSnapshot`으로 남았습니다. 그다음 victim-a를 재시작하고, 재시작하지 않은 victim-b와 비교했습니다.

확인한 항목만 비교했습니다.

| 항목 | victim-a (재시작) | victim-b (그대로) |
|---|---|---|
| SA 토큰 (메모리) | 새 토큰으로 바뀜 | 바뀌지 않음 |
| 리스너 프로세스, /tmp의 압축 파일 | 사라짐 | 재시작하지 않아 비교 대상 아님 |
| PVC의 확인한 파일 3개 | 해시 그대로 남음 | 같은 변조본 해시 |
| Container Insights 로그 | 지운 파드의 로그도 확인됨 | 해당 없음 |

### 3-7. 증거를 지킨 방법

이 보존 실험은 앞선 공격 재현의 증거 묶음으로 했습니다. 마지막 재현의 증거 묶음은 해시 목록까지만 만들고, 지울 수 없는 저장소로 옮기지는 못했습니다.

- 증거 파일마다 SHA-256을 계산해 `SHA256SUMS` 목록을 만들었습니다.
- Object Lock을 켠 S3 버킷을 만들고 기본 보존 규칙을 COMPLIANCE 1일로 걸었습니다. 증거를 올린 뒤 새 폴더로 다시 받아 `sha256sum -c`로 대조했고, 모두 일치했습니다.
- 잠긴 객체를 지워 보고, 거버넌스 우회 옵션으로도 지워 봤습니다. 둘 다 `AccessDenied`로 거부되었습니다.

```bash
aws s3api put-object-lock-configuration --bucket <증거 버킷> \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":1}}}'
( cd <다시 받은 폴더> && sha256sum -c SHA256SUMS )     # 전부 OK
aws s3api delete-object --bucket <증거 버킷> --key .../SHA256SUMS --version-id <버전> \
  --bypass-governance-retention                       # → AccessDenied
```

- 노드 로그는 SSH로 들어가지 않고 SSM Run Command로 해시와 함께 가져왔습니다. 침해된 노드에 직접 접속하는 일을 줄이기 위해서입니다.

### 3-8. 증거만으로 다시 맞춰 본 결과

정답지를 뺀 증거만 보고 공격 과정을 다시 맞췄습니다. 9단계를 모두 식별했지만, 일부 원본 출력과 증거가 빠져 있어 주요 흐름을 조건부로 재구성한 것으로 평가했습니다.

처음 질문의 답도 바뀌었습니다.

- 증거는 CloudTrail 하나에 다 있지 않았습니다. 컨테이너 안의 일은 Container Insights와 Falco, 쿠버네티스 API는 EKS Audit, 통신은 Flow Logs에 나뉘어 있었습니다.
- 재시작해도 전부 사라지지 않았습니다. 메모리와 /tmp는 사라졌지만, PVC 파일과 중앙으로 보낸 로그는 남았습니다.
- 캡처만으로는 부족했습니다. 해시 목록과 지울 수 없는 저장소가 있어야 증거를 믿게 할 수 있었습니다.

그 밖에 알게 된 것들입니다.

- 파드를 지운 직후 401 응답이 기록되었습니다. 다만 그 응답이 훔친 토큰 때문이라는 연결은 확보한 원문만으로 확정하기 어려웠습니다.
- 캡처한 시각까지 GuardDuty 경보는 0건이었습니다. 경보가 늦게 생길 수도 있지만, 관리형 탐지 서비스만으로 모든 흔적을 확인하기는 어렵다고 느꼈습니다.

## 4. 부족했던 점

- 결과를 실제보다 크게 쓴 적이 있습니다. 재구성 결과를 채점하면서 증거에 실제로 있던 내용을 지어낸 것으로 잘못 판정했고, 9단계 전부 완전히 입증했다고 적었습니다. 다시 확인해 보니 어떤 단계는 명령 실행 결과 원본이 없었고, 증거 묶음 전체의 해시 목록도 처음에는 없었습니다. 해시 목록은 나중에 만들었지만, 처음부터 갖췄어야 했습니다.
- AWS Config, DNS 쿼리 로깅, S3 로깅을 ③ 이후에 켜서 앞 단계는 볼 수 없었습니다. 수집원은 늦게 켜면 과거를 잡지 못합니다.
- S3로 유출하는 경로(⑦-b)는 실행하지 못했고, NetworkPolicy가 금지한 통신을 실제로 막는지도 시험하지 않았습니다.
- Container Insights 로그와 리스너 로컬 로그는 같은 stdout의 복사본일 수 있어서, 서로 독립된 두 증거라고 말하기 어렵습니다.
- Falco 규칙이 실제로 울리는지 미리 확인하지 않아서, ① 시점에 Falco 경보가 없던 이유를 아직 확인하지 못했습니다.
- 공격 재현을 여러 차례 다시 했습니다. 재현 결과를 자동으로 점검하는 장치가 없어서 문제를 뒤늦게 발견했습니다.
- 이번 시나리오는 체크포인트를 쓰지 않는 환경에서 분석했고, kubelet 체크포인트(실행 중인 컨테이너의 메모리 상태를 통째로 저장하는 방법)는 아직 실습하지 못했습니다.

## 5. 앞으로 할 것

- 증거를 모으는 순간 해시 목록과 원본 출력을 함께 남기는 수집 스크립트를 만들겠습니다.
- 모든 수집원을 공격 전에 켜고, 켜진 것을 확인한 뒤에 공격을 시작하겠습니다.
- 공격을 재현하기 전에 탐지 규칙이 실제로 울리는지 먼저 시험하겠습니다.
- kubelet 체크포인트로 컨테이너 메모리를 통째로 보존하고, 그 안에서 자격 증명과 연결 정보를 찾아보겠습니다.
- 이번 과정을 누구나 따라 할 수 있는 조사 플레이북으로 정리하겠습니다.
