---
title: "[컨퍼런스 리뷰] ECS-cape — 컨테이너를 탈출하지 않고 다른 태스크의 IAM 역할에 닿는 길 (Black Hat USA 2025)"
category: papers-conferences
sub: "컨퍼런스 발표"
description: "컨테이너를 탈출하지 않아도 같은 EC2 위 다른 태스크의 IAM 역할에 닿을 수 있다는 Black Hat USA 2025 발표를 질문으로 따라가고, AWS 환경에서 전제 조건과 차단 지점을 직접 확인한 기록입니다."
---

미션은 DEFCON, Black Hat 같은 해외 컨퍼런스 영상을 보고 자신만의 스타일로 리뷰하는 것입니다. 이 글은 Black Hat USA 2025의 ECS-cape 발표를 골라, 공개된 슬라이드와 발표자의 원글, AWS 문서를 기준으로 정리하고 AWS 계정에서 직접 확인한 실습을 더했습니다.

| 항목 | 내용 |
|---|---|
| 제목 | ECS-cape – Hijacking IAM Privileges in Amazon ECS |
| 발표자 | Naor Haziz (Sweet Security) |
| 행사 | Black Hat USA 2025 |
| 영상 | <https://www.youtube.com/watch?v=UV-hS-DTeik> |
| 슬라이드 | <https://i.blackhat.com/BH-USA-25/Presentations/US-25-Haziz-ECS-cape-Hijacking-IAM-Privileges-in-Amazon-ECS-Wednesday.pdf> (129쪽) |
| 원글 | <https://www.sweet.security/blog/ecscape-understanding-iam-privilege-boundaries-in-amazon-ecs> (2025-08-06) |

글에서 `[슬라이드 N쪽]`은 슬라이드 PDF의 쪽 번호입니다. 공격은 무엇이 왜 가능한지, 전제와 영향 수준까지만 적고, 실습은 방어 관점에서 직접 확인한 것만 실었습니다.

## 어떤 발표를 골랐나요?

먼저 후보 5개를 놓고 비교했습니다.

| 번호 | 발표 | 행사 | 한 줄 요약 |
|---|---|---|---|
| 1 | ECScape (ECS-cape) | Black Hat USA 2025 | ECS 컨테이너가 같은 EC2 위 다른 태스크의 IAM 역할을 가로챔 |
| 2 | Breaching AWS Accounts Through Shadow Resources | Black Hat USA 2024 / DEF CON 32 | AWS가 자동 생성하는 S3 버킷을 선점해 찾은 취약점 6개 |
| 3 | Kicking in the Door to the Cloud (Nick Frichette) | DEF CON 32 | AWS 서비스 취약점으로 남의 계정에 초기 침투 |
| 4 | Breaking Out of The AI Cage (Wiz) | Black Hat USA 2025 | NVIDIA Container Toolkit 컨테이너 탈출 |
| 5 | AWS CloudQuarry | DEF CON 32 | 공개 AMI 속에 남은 자격 증명 |

1번을 고른 이유는 셋입니다.

- 컨테이너와 IAM이라는 주제가 직전에 진행한 EKS 컨테이너 포렌식 프로젝트(클라우드 포렌식)와 이어집니다.
- 컨테이너를 탈출하지 않고도 권한이 넘어간다는 점이 궁금했습니다. 4번처럼 탈출이 필요한 발표와 비교되는 지점입니다.
- AWS가 이 문제를 취약점이 아니라고 답했다는 점이 궁금했습니다.

## 보기 전에 어떤 질문을 세웠나요?

발표를 보기 전에 일곱 가지 질문을 적었습니다. 이 질문은 글 끝의 되돌아보기 표에서 다시 답합니다.

| 번호 | 질문 | 왜 궁금한가 |
|---|---|---|
| Q1 | 컨테이너를 탈출하지 않고 다른 태스크의 역할을 얻는다는 게 무슨 뜻인가? | 컨테이너는 격리된 단위라는 통념과 맞는지 보려고 |
| Q2 | 어떤 조건에서 성립하나? | 모든 ECS에서 일어나는 일인지 보려고 |
| Q3 | 성립하면 무엇을 얻을 수 있나? | 피해 범위를 가늠하려고 |
| Q4 | AWS는 왜 취약점이 아니라고 했고, 언론은 왜 결함이라고 불렀나? | 같은 사실을 두고 평가가 갈려서 |
| Q5 | 어떻게 막을 수 있나? | 방어하는 쪽이 할 일을 알고 싶어서 |
| Q6 | 일어났다면 어떻게 알아챌 수 있나? | 사후 조사의 단서를 알고 싶어서 |
| Q7 | Fargate는 왜 다른가? | 어느 환경에서는 해당하지 않는다고 해서 |

## 먼저 알아야 할 ECS 용어는 무엇인가요?

### ECS on EC2와 태스크

Amazon ECS는 컨테이너를 실행하는 AWS 서비스입니다. 컨테이너를 돌릴 서버를 직접 운영하면 ECS on EC2이고, 서버 운영을 AWS에 맡기면 Fargate입니다. 태스크는 ECS가 한 번에 실행하는 컨테이너 묶음이고, 태스크 정의(task definition)에 이미지와 역할, 네트워크 모드를 적습니다. ECS on EC2에서는 여러 태스크가 같은 EC2 인스턴스를 나눠 씁니다.

### 태스크 역할, 실행 역할, 인스턴스 역할

- 태스크 역할: 태스크 안의 컨테이너가 AWS API를 부를 때 쓰는 IAM 역할입니다. 이 실습에서는 low 태스크에 `ecscape-lab-task-role`(S3 버킷 목록 조회만 허용), high 태스크에 `ecscape-lab-high-role`(EC2 인스턴스 조회만 허용)을 붙였습니다.
- 실행 역할: ECS가 태스크를 시작할 때 이미지를 가져오거나 로그를 보내는 데 쓰는 역할입니다. 원글은 AWS 문서가 태스크 컨테이너는 접근할 수 없다고 설명한 역할이라고 적었습니다 ([원글](https://www.sweet.security/blog/ecscape-understanding-iam-privilege-boundaries-in-amazon-ecs)). 실습에서는 `AmazonECSTaskExecutionRolePolicy`를 붙인 `ecscape-lab-exec-role`입니다.
- 인스턴스 역할: EC2 인스턴스 자체에 붙는 역할입니다. ECS 에이전트가 쓰는 관리형 정책 `AmazonEC2ContainerServiceforEC2Role`을 연결합니다 ([슬라이드 13쪽, 48쪽]).

### ECS 에이전트

ECS 에이전트는 EC2 인스턴스에서 ECS와 통신하며 태스크를 관리하는 프로그램입니다. 실습 인스턴스에서는 `amazon/amazon-ecs-agent` 이미지의 `ecs-agent` 컨테이너로 돌고 있었습니다(단계 A 출력). 발표의 요점은 이 에이전트와 태스크가 같은 인스턴스 위에 있다는 사실입니다.

### 두 개의 주소

| 주소 | 이름 | 역할 |
|---|---|---|
| 169.254.170.2 | 태스크 자격 증명 엔드포인트 | 컨테이너가 환경 변수 `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI` 경로로 자기 태스크 역할의 임시 자격 증명을 받는 곳 |
| 169.254.169.254 | IMDS(인스턴스 메타데이터 서비스) | 인스턴스가 자기 정보와 인스턴스 역할 자격 증명을 받는 곳. IMDSv2는 먼저 토큰을 요청(PUT)한 뒤 조회 |

IMDS에는 hop limit이 있습니다. PUT 응답이 거칠 수 있는 네트워크 홉 수를 1~64로 제한하는 값이고([AWS 문서](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-options.html)), 컨테이너에서 가는 길은 추가 홉으로 셉니다. 문서는 컨테이너 환경에서 hop limit이 1이면 컨테이너가 응답을 받지 못할 수 있어 2로 올리는 것을 고려하라고 안내합니다 ([AWS 문서](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html)).

### bridge, awsvpc, Fargate

- bridge: 컨테이너가 호스트의 Docker 브리지 네트워크를 쓰는 모드입니다. 이 실습의 EC2 태스크 정의가 bridge입니다.
- awsvpc: 태스크마다 자기 네트워크 인터페이스를 갖는 모드입니다. 문서에 따르면 awsvpc 모드 태스크는 에이전트 변수 `ECS_AWSVPC_BLOCK_IMDS=true`로 인스턴스 프로파일 자격 증명 접근을 막으면서 태스크 역할 권한은 유지할 수 있습니다 ([AWS 문서](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)).
- Fargate: 태스크마다 자체 격리 경계를 갖고 커널, CPU, 메모리, ENI를 공유하지 않습니다 ([AWS 문서](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)). 이 실습의 Fargate 태스크 정의는 awsvpc입니다.

## 컨테이너를 탈출하지 않고 다른 태스크의 역할을 얻는다는 게 무슨 뜻인가요? (Q1)

슬라이드 요약과 원글 TL;DR을 읽었습니다.

발표의 결론 슬라이드는 이렇게 시작합니다.

> "On EC2, tasks and the ECS agent share one trust boundary"  
> [슬라이드 128쪽]

ECS on EC2에서는 태스크와 에이전트가 하나의 신뢰 경계 안에 있다는 뜻입니다. 같은 슬라이드와 62쪽은 핵심 가능성을 이렇게 묻고 답합니다.

> "Can a Task Impersonate the ECS Agent?" / "A task can impersonate the ECS agent"  
> [슬라이드 62쪽, 128쪽]

태스크가 에이전트처럼 행동할 수 있다는 것입니다. 원글은 그 결과를 한 문장으로 요약합니다.

> "A malicious container with a low‑privileged IAM role can obtain the permissions of a higher‑privileged container running on the same host."  
> [원글 TL;DR]

그리고 이 일이 컨테이너 탈출 없이 일어난다고 적었습니다.

> "No container breakout (no hostroot access) was required"  
> [원글 TL;DR]

정리하면, 컨테이너의 격리를 깨는 것이 아니라 인스턴스 위에서 에이전트와 태스크가 같은 경계에 놓여 있다는 구조를 이용하는 일입니다. 어떻게 에이전트인 척하는지는 이 글에서 다루지 않고 개념까지만 적습니다.

다음 질문은 이 일이 항상 성립하느냐입니다.

## 어떤 조건에서 성립하나요? (Q2)

원글 TL;DR과 슬라이드 95쪽 영향 슬라이드를 봤습니다. 원글이 든 전제는 다음과 같습니다 ([원글](https://www.sweet.security/blog/ecscape-understanding-iam-privilege-boundaries-in-amazon-ecs)).

- ECS on EC2를 쓴다.
- 권한이 서로 다른 태스크가 같은 EC2 인스턴스에서 실행된다.
- 저권한 컨테이너가 손상됐다.
- IMDS에 도달할 수 있다.

원글은 같은 인스턴스에서 실행되는 동안에만 성립한다고 적었고("as long as they are running on the same instance"), 슬라이드 95쪽은 별도의 오설정이 필요 없다고 표현합니다.

> "No Misconfiguration Needed - IMDS & Instance Role"  
> [슬라이드 95쪽]

원글의 Impact 절도 ECS on EC2의 기본 동작과 설정으로 성립한다고 적었습니다. 그래서 이 실습은 방어하는 쪽에서 확인할 수 있는 전제, 즉 같은 인스턴스에 서로 다른 역할의 태스크가 있다는 것과 컨테이너에서 IMDS에 닿는다는 것을 확인하는 데 맞췄습니다(단계 B, C).

## 성립하면 무엇을 얻을 수 있나요? (Q3)

슬라이드 87~95쪽과 원글을 읽었습니다.

- 같은 인스턴스의 더 높은 권한 태스크 IAM 역할: 슬라이드는 교차 태스크 IAM 역할 탈취(Cross-Task IAM Role Hijacking)를 낮은 권한 역할에서 높은 권한 역할로 가는 그림으로 보여 줍니다 ([슬라이드 87~89쪽, 95쪽]).
- 태스크 실행 역할 악용(Abuse of Task Execution Role)과 ECS 내부 정보 접근(Access to ECS Internals) ([슬라이드 90~91쪽, 95쪽]). 원글은 문서가 태스크 컨테이너 접근 불가라고 한 실행 역할도 에이전트가 쓰기 때문에 노출되며 비밀이나 사설 레지스트리 접근으로 이어질 수 있다고 적었습니다 ([원글](https://www.sweet.security/blog/ecscape-understanding-iam-privilege-boundaries-in-amazon-ecs)).
- 멀티테넌트에서는 테넌트 간 침범으로 이어집니다 ([슬라이드 92~93쪽]).

얻는 범위는 가로챈 역할이 가진 권한만큼입니다. 이번 실습의 low 역할은 S3 버킷 목록 조회, high 역할은 EC2 인스턴스 조회만 허용하게 일부러 작게 만들어 두었습니다.

## AWS는 왜 취약점이 아니라고 했고, 언론은 왜 결함이라고 했나요? (Q4)

슬라이드 124~127쪽, 원글의 Responsible Disclosure 절, AWS 문서와 보안 블로그, 언론 기사를 비교했습니다.

AWS의 공식 성명은 슬라이드 127쪽에 실려 있습니다.

> "containers were and are never considered a security boundary in AWS"  
> [슬라이드 127쪽]

같은 성명에서 AWS는 기본 동작 변경을 검토 중이라고 하면서도, 변경이 접근을 불가능하게 하는 것이 아니라 복잡하게 만들 뿐이라고 했습니다.

> "changes to this default behavior are under consideration" / "could make it more complicated for containers to access the privileges available to the ECS agent, not make it impossible"  
> [슬라이드 127쪽]

책임 소재에 대해서도 이렇게 적었습니다.

> "customers are responsible for guarding against all security issues within a container"  
> [슬라이드 127쪽]

연구의 결과로는 문서와 기존 블로그를 수정하고 명확히 했다고 밝혔습니다.

> "resulted in modifications and clarifications in our documentation and an existing blog post"  
> [슬라이드 127쪽]

원글은 AWS가 이를 설계상 고려 사항(design consideration)으로 판정했고 CVE나 보안 공지를 내지 않았다고 적었습니다 ([원글](https://www.sweet.security/blog/ecscape-understanding-iam-privilege-boundaries-in-amazon-ecs)). 슬라이드 125~126쪽에는 AWS 보안팀이 공식 문서에 연구자 크레딧을 싣는 것은 당시 어렵다고 회신한 이메일이 실려 있습니다("we're unable to include this in our public documentation at this time").

AWS 보안 블로그도 같은 입장입니다.

> "AWS does not consider a container or primitives such as an ECS task or a Kubernetes pod to be a security boundary."  
> [AWS 보안 블로그](https://aws.amazon.com/blogs/security/security-considerations-for-running-containers-on-amazon-ecs/)

반면 언론은 다르게 불렀습니다. CSO Online 기사의 주소는 `ecscape-new-aws-ecs-flaw-lets-containers-hijack-iam-roles-without-breaking-out`으로, 결함(flaw)이라는 표현을 씁니다 ([CSO Online 기사](https://www.csoonline.com/article/4036655/ecscape-new-aws-ecs-flaw-lets-containers-hijack-iam-roles-without-breaking-out.html)).

| 출처 | 표현 |
|---|---|
| AWS 성명 | 컨테이너는 보안 경계가 아니고, 컨테이너 안의 보안은 고객 책임 |
| 원글이 전한 AWS 판정 | 설계상 고려 사항, CVE와 보안 공지 없음 |
| CSO Online | ECS flaw, 탈출 없이 IAM 역할 탈취 |

차이는 무엇을 기준으로 보느냐에서 나옵니다. AWS는 컨테이너가 보안 경계가 아니라는 설계 원칙에서 출발하므로 에이전트와 태스크가 같은 경계라는 것은 의도된 구조이고, CSO Online 기사는 IMDS가 기본으로 열려 있고 사용자 쪽 오설정 없이도 컨테이너 탈출 없이 IAM 역할을 가로챈다는 결과를 중심으로 flaw라고 표현합니다.

문서는 실제로 바뀌었습니다. 슬라이드 124쪽(Documentation Change)이 보여 주는 전후는 다음과 같습니다.

| 시점 | 내용 |
|---|---|
| 변경 전 | 컨테이너는 다른 태스크의 자격 증명에 접근하지 못한다는 취지 |
| 변경 후 | "tasks running on the same EC2 instance may potentially access credentials belonging to other tasks on that instance" / "consider Fargate which provides task-level isolation" |

현재 태스크 IAM 역할 문서에도 같은 내용이 있습니다.

> "there is no task isolation and containers can potentially access credentials for other tasks on the same container instance"  
> [AWS 문서 task-iam-roles](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)

## 어떻게 막고, 어떻게 알아챌 수 있나요? (Q5, Q6, Q7)

### 막는 방법

슬라이드 114~121쪽의 권고와 원글의 Mitigation 절, AWS 문서를 같이 봤습니다.

- 태스크의 IMDS 접근 차단 ([슬라이드 114쪽]). 원글은 이것이 가장 효과적인 완화책이라고 적었습니다("This is the single most effective mitigation").
- 태스크 역할과 실행 역할 권한 최소화 ([슬라이드 115~116쪽]).
- 높은 권한 워크로드와 낮은 권한 워크로드를 별도 인스턴스로 분리 ([슬라이드 117~118쪽]), 멀티테넌트 격리 ([슬라이드 119~121쪽]).
- Fargate 사용. 원글은 인스턴스를 같이 쓰는 일이 없어 ECScape가 해당하지 않는다고 적었습니다("ECScape does not apply to Fargate because there is no co-tenancy of the instance.").

AWS 보안 모범 사례 문서도 같은 방향입니다.

> "we strongly recommend that you block container access to the Amazon EC2 Instance Metadata Service (IMDS)"  
> [AWS 문서 security-iam-roles](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-iam-roles.html)

다만 AWS 성명이 네트워크 변경은 접근을 복잡하게 할 뿐 불가능하게 하지는 않는다고 했으므로 ([슬라이드 127쪽]), IMDS 차단은 핵심 대책이면서도 권한 최소화와 워크로드 분리 같은 다른 대책과 함께 쓰는 것이 맞습니다.

### 알아채는 방법

원글에 따르면 가로챈 태스크 자격 증명을 AWS에서 쓰면 그 사용은 피해 태스크 역할로 귀속됩니다.

> "any use of those credentials in AWS is attributed to that task’s role"  
> [원글 Impact 절](https://www.sweet.security/blog/ecscape-understanding-iam-privilege-boundaries-in-amazon-ecs)

평소 하지 않던 API, 시각, 환경에서의 사용이 사후 조사의 단서가 됩니다. 컨테이너에서 나오는 ECS API 호출이나 컨테이너 프로세스의 비정상 AWS 도메인 연결, 외부 IP에서의 인스턴스 자격 증명 사용은 GuardDuty로 일부 포착할 수 있지만, AWS 내부에서의 태스크 자격 증명 오남용은 탐지가 더 어렵다고 원글 Mitigation 절은 적었습니다("intra-AWS misuse of task credentials is harder, so combine with CloudTrail anomaly alerts."). 원글은 컨테이너에서 IMDS를 읽는 요청 자체는 CloudTrail에 남지 않는다고 서술합니다(원글 Step 1).

## 직접 해 보면 무엇이 보이나요?

방어 관점에서 확인할 수 있는 것만 AWS 서울 리전(ap-northeast-2)에서 직접 했습니다. 아래 그림은 실습 환경의 지도입니다. 그림 번호 1~6은 단계 B~F와 이어집니다.

![실습 지도: 같은 EC2 위 low/high 태스크, ecs-agent, 자격 증명 엔드포인트, IMDS, 차단 지점, CloudTrail, Fargate]({{ '/assets/img/posts/ecscape-review-lab-map.svg' | relative_url }})

- 단계 A: 환경 만들기. 같은 EC2 한 대에 low 태스크, high 태스크, ecs-agent를 둔다.
- 그림 1, 단계 B: 정상 흐름. 태스크마다 자기 역할의 자격 증명만 받는지 본다.
- 그림 2, 단계 C: 전제 조건 관찰. 컨테이너에서 IMDS에 닿는지 본다.
- 그림 3, 단계 D1: hop limit을 1로 낮추면 어떻게 되는지 본다.
- 그림 4, 단계 D2: 호스트 방화벽(DOCKER-USER) 규칙으로 컨테이너의 IMDS 접근을 막아 본다.
- 그림 5, 단계 E: 태스크 호출이 CloudTrail에 어떻게 남는지 본다.
- 그림 6, 단계 F: Fargate에서 같은 확인을 한다.
- 정리: 만든 것을 모두 지우고 삭제를 확인한다.

### 단계 A. 실습 환경은 어떻게 만들었나요?

목적은 ECS on EC2 한 대에 태스크 두 개가 같이 도는 환경을 만드는 것입니다. 기본 VPC에 클러스터와 IAM 역할, 보안 그룹(인바운드 없음)을 만들고, t3.micro 인스턴스를 띄웠습니다. 먼저 현재 자격 증명과 리전, 기본 VPC를 확인했습니다.

```text
$ aws sts get-caller-identity
{
    "UserId": "<USER_ID>",
    "Account": "<ACCOUNT_ID>",
    "Arn": "arn:aws:iam::<ACCOUNT_ID>:user/<IAM_USER>"
}
$ aws configure get region
ap-northeast-2
$ aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query Vpcs[].VpcId
[
    "vpc-03ff2c50f9789360f"
]
```

IAM 역할의 신뢰 정책과 권한 정책 정의는 다음과 같습니다.

ec2-trust.json
```json
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
```

ecs-task-trust.json (태스크 역할과 실행 역할에 공통으로 사용)
```json
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}
```

task-policy.json (low 태스크 역할 `list-buckets-only`)
```json
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:ListAllMyBuckets","Resource":"*"}]}
```

high-policy.json (high 태스크 역할 `describe-instances-only`)
```json
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"ec2:DescribeInstances","Resource":"*"}]}
```

클러스터, 역할, 인스턴스 프로파일, 보안 그룹을 만든 기록입니다.

```text
++ aws ecs create-cluster --cluster-name ecscape-lab --query 'cluster.[clusterName,status]' --output text
ecscape-lab	ACTIVE
++ aws iam create-role --role-name ecscape-lab-instance-role --assume-role-policy-document file://ec2-trust.json --query Role.Arn --output text
arn:aws:iam::<ACCOUNT_ID>:role/ecscape-lab-instance-role
++ aws iam attach-role-policy --role-name ecscape-lab-instance-role --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role
++ aws iam attach-role-policy --role-name ecscape-lab-instance-role --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
++ aws iam create-instance-profile --instance-profile-name ecscape-lab-profile --query InstanceProfile.Arn --output text
arn:aws:iam::<ACCOUNT_ID>:instance-profile/ecscape-lab-profile
++ aws iam add-role-to-instance-profile --instance-profile-name ecscape-lab-profile --role-name ecscape-lab-instance-role
++ aws iam create-role --role-name ecscape-lab-task-role --assume-role-policy-document file://ecs-task-trust.json --query Role.Arn --output text
arn:aws:iam::<ACCOUNT_ID>:role/ecscape-lab-task-role
++ aws iam put-role-policy --role-name ecscape-lab-task-role --policy-name list-buckets-only --policy-document file://task-policy.json
++ aws ec2 create-security-group --group-name ecscape-lab-sg --description 'ecscape lab, no inbound' --vpc-id vpc-03ff2c50f9789360f --query GroupId --output text
sg-071d31f7c5b7a4a4d
++ set +x
```

인스턴스는 IMDSv2 필수, hop limit 2로 시작했습니다. 사용자 데이터는 인스턴스가 클러스터에 등록하도록 한 줄만 둡니다.

userdata.sh
```bash
#!/bin/bash
echo ECS_CLUSTER=ecscape-lab >> /etc/ecs/ecs.config
```

```text
++ aws ec2 run-instances --image-id ami-08f319875b4de8f53 --instance-type t3.micro --iam-instance-profile Name=ecscape-lab-profile --security-group-ids sg-071d31f7c5b7a4a4d --subnet-id subnet-093aaf87ad6348fdb --user-data file://userdata.sh --metadata-options HttpTokens=required,HttpPutResponseHopLimit=2,HttpEndpoint=enabled --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=ecscape-lab}]' --query 'Instances[0].[InstanceId,InstanceType,MetadataOptions.HttpTokens,MetadataOptions.HttpPutResponseHopLimit]' --output text
i-0cfe26e57c1c1f1c8	t3.micro	required	2
++ set +x
```

다음으로 로그 그룹, high 태스크 역할, 실행 역할을 만들고 태스크 정의 3개를 등록했습니다.

```text
++ aws iam create-role --role-name ecscape-lab-high-role --assume-role-policy-document file://ecs-task-trust.json --query Role.RoleName --output text
ecscape-lab-high-role
++ aws iam put-role-policy --role-name ecscape-lab-high-role --policy-name describe-instances-only --policy-document file://high-policy.json
++ aws iam create-role --role-name ecscape-lab-exec-role --assume-role-policy-document file://ecs-task-trust.json --query Role.RoleName --output text
ecscape-lab-exec-role
++ aws iam attach-role-policy --role-name ecscape-lab-exec-role --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
++ aws logs create-log-group --log-group-name /ecs/ecscape-lab
++ aws logs put-retention-policy --log-group-name /ecs/ecscape-lab --retention-in-days 1
++ for t in low high fargate
++ aws ecs register-task-definition --cli-input-json file://td-low.json --query 'taskDefinition.[family,revision,networkMode]' --output text
ecscape-low	1	bridge
++ for t in low high fargate
++ aws ecs register-task-definition --cli-input-json file://td-high.json --query 'taskDefinition.[family,revision,networkMode]' --output text
ecscape-high	1	bridge
++ for t in low high fargate
++ aws ecs register-task-definition --cli-input-json file://td-fargate.json --query 'taskDefinition.[family,revision,networkMode]' --output text
ecscape-fargate	1	awsvpc
++ set +x
```

태스크 정의는 다음과 같습니다. low와 high는 bridge 모드로, 컨테이너는 `sleep infinity`만 돌립니다.

td-low.json
```json
{"family":"ecscape-low","networkMode":"bridge","requiresCompatibilities":["EC2"],
 "taskRoleArn":"arn:aws:iam::<ACCOUNT_ID>:role/ecscape-lab-task-role",
 "containerDefinitions":[{"name":"low","image":"public.ecr.aws/amazonlinux/amazonlinux:2023","memory":128,"essential":true,"command":["sleep","infinity"]}]}
```

td-high.json
```json
{"family":"ecscape-high","networkMode":"bridge","requiresCompatibilities":["EC2"],
 "taskRoleArn":"arn:aws:iam::<ACCOUNT_ID>:role/ecscape-lab-high-role",
 "containerDefinitions":[{"name":"high","image":"public.ecr.aws/amazonlinux/amazonlinux:2023","memory":128,"essential":true,"command":["sleep","infinity"]}]}
```

td-fargate.json (단계 F에서 사용)
```json
{"family":"ecscape-fargate","networkMode":"awsvpc","requiresCompatibilities":["FARGATE"],"cpu":"256","memory":"512",
 "taskRoleArn":"arn:aws:iam::<ACCOUNT_ID>:role/ecscape-lab-task-role",
 "executionRoleArn":"arn:aws:iam::<ACCOUNT_ID>:role/ecscape-lab-exec-role",
 "containerDefinitions":[{"name":"fargate","image":"public.ecr.aws/amazonlinux/amazonlinux:2023","essential":true,
  "command":["sh","-c","echo '[IMDS 169.254.169.254]'; curl -s -m 5 -o /dev/null -w 'http=%{http_code} exit=' -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60'; echo $?; echo '[task credentials endpoint]'; echo AWS_CONTAINER_CREDENTIALS_RELATIVE_URI=set:${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI:+yes}; curl -s -m 5 -o /dev/null -w 'http=%{http_code}\\n' http://169.254.170.2$AWS_CONTAINER_CREDENTIALS_RELATIVE_URI"],
  "logConfiguration":{"logDriver":"awslogs","options":{"awslogs-group":"/ecs/ecscape-lab","awslogs-region":"ap-northeast-2","awslogs-stream-prefix":"fargate"}}}]}
```

td-cli.json (단계 E에서 사용. 공식 aws-cli 이미지로 일회성 태스크를 띄워 호출)
```json
{"family":"ecscape-cli","networkMode":"bridge","requiresCompatibilities":["EC2"],
 "taskRoleArn":"arn:aws:iam::<ACCOUNT_ID>:role/ecscape-lab-task-role",
 "executionRoleArn":"arn:aws:iam::<ACCOUNT_ID>:role/ecscape-lab-exec-role",
 "containerDefinitions":[{"name":"cli","image":"public.ecr.aws/aws-cli/aws-cli:latest","memory":200,"essential":true,
  "entryPoint":["sh","-c"],"command":["aws s3api list-buckets --query 'length(Buckets)' && echo list-buckets OK; aws ec2 describe-instances --max-items 1 >/dev/null 2>&1 || echo describe-instances DENIED; date -u +%FT%TZ"],
  "environment":[{"name":"AWS_DEFAULT_REGION","value":"ap-northeast-2"}],
  "logConfiguration":{"logDriver":"awslogs","options":{"awslogs-group":"/ecs/ecscape-lab","awslogs-region":"ap-northeast-2","awslogs-stream-prefix":"cli"}}}]}
```

인스턴스가 클러스터에 등록된 뒤 컨테이너 인스턴스 목록과 인스턴스 역할의 정책, 호스트의 에이전트 컨테이너를 확인했습니다. 호스트 안 명령은 SSM Run Command로 실행하는 아래 도우미 스크립트로 보냈습니다.

hostrun.sh
```bash
#!/bin/bash
# usage: hostrun.sh "<shell commands to run on the ECS host>"  -> prints stdout/stderr via SSM Run Command
IID=i-0cfe26e57c1c1f1c8
CMD=$(aws ssm send-command --instance-ids $IID --document-name AWS-RunShellScript \
  --parameters "$(jq -n --arg c "$1" '{commands:[$c]}')" --query Command.CommandId --output text)
aws ssm wait command-executed --command-id $CMD --instance-id $IID 2>/dev/null
aws ssm get-command-invocation --command-id $CMD --instance-id $IID \
  --query '[StandardOutputContent,StandardErrorContent]' --output text
```

```text
$ aws ecs list-container-instances --cluster ecscape-lab
CONTAINERINSTANCEARNS	arn:aws:ecs:ap-northeast-2:<ACCOUNT_ID>:container-instance/ecscape-lab/0df47ed80f6545b3a754e5dc68501e17
$ aws iam list-attached-role-policies --role-name ecscape-lab-instance-role
AmazonSSMManagedInstanceCore	AmazonEC2ContainerServiceforEC2Role
$ [host] docker ps ; cat /etc/ecs/ecs.config
ecs-agent  amazon/amazon-ecs-agent:latest  Up 37 seconds (healthy)
---
ECS_CLUSTER=ecscape-lab
```

컨테이너 인스턴스가 하나 등록됐고, 인스턴스 역할에는 `AmazonSSMManagedInstanceCore`와 `AmazonEC2ContainerServiceforEC2Role`이 붙어 있으며, 호스트에서 `ecs-agent` 컨테이너가 healthy 상태로 돌고 있습니다. `/etc/ecs/ecs.config`에는 클러스터 이름만 있습니다. 콘솔에서도 같은 상태를 확인했습니다.

![ECS 콘솔의 클러스터 ecscape-lab 인프라 화면]({{ '/assets/img/posts/ecscape-review/01-ecs-cluster.jpg' | relative_url }})

*클러스터 ecscape-lab의 인프라 탭. 용량 공급자 0, 컨테이너 인스턴스 1개(t3.micro, 활성, EC2)입니다.*

![ECS 태스크 목록]({{ '/assets/img/posts/ecscape-review/02-ecs-tasks.jpg' | relative_url }})

*태스크 4개. ecscape-high:1과 ecscape-low:1은 실행 중이고 ecscape-fargate:1과 ecscape-cli:1은 중지됨입니다.*

![low 태스크 정의]({{ '/assets/img/posts/ecscape-review/03-taskdef-low.jpg' | relative_url }})

*ecscape-low:1. 태스크 역할 ecscape-lab-task-role, 실행 역할 없음, 네트워크 모드 bridge, 앱 환경 EC2입니다.*

![high 태스크 정의]({{ '/assets/img/posts/ecscape-review/04-taskdef-high.jpg' | relative_url }})

*ecscape-high:1. 태스크 역할 ecscape-lab-high-role, 네트워크 모드 bridge, 앱 환경 EC2입니다.*

![IAM 역할 검색 결과]({{ '/assets/img/posts/ecscape-review/06-iam-roles.jpg' | relative_url }})

*역할 이름에 ecscape-lab을 검색한 결과 4개. exec-role, high-role, task-role은 ecs-tasks를, instance-role은 ec2를 신뢰합니다.*

![low 역할의 인라인 정책]({{ '/assets/img/posts/ecscape-review/07-iam-task-policy.jpg' | relative_url }})

*ecscape-lab-task-role의 인라인 정책 list-buckets-only. 허용 작업은 s3:ListAllMyBuckets 하나, 리소스는 전체(`*`)입니다.*

해석: 인스턴스 하나에 권한이 다른 태스크 두 개와 에이전트가 같이 있습니다. 원글이 든 전제 중 서로 다른 권한의 태스크가 같은 인스턴스에 있다는 조건이 이 환경에서 갖춰졌습니다.

### 단계 B. 정상 흐름에서는 태스크마다 무엇을 받나요?

목적은 평소 동작을 먼저 보는 것입니다(그림 1). 두 태스크의 컨테이너 안에서, 태스크 자격 증명 엔드포인트가 돌려주는 값 중 역할 ARN과 만료 시각만 추려 봤습니다. 자격 증명 값 자체는 기록에 남기지 않았습니다. 호스트에서 실행 중인 태스크 컨테이너마다 아래 명령을 돌렸습니다.

```bash
# 호스트에서 (SSM Run Command, hostrun.sh)
for c in $(docker ps --format '{% raw %}{{.Names}}{% endraw %}' | grep -v ecs-agent); do
  echo "== container: $c"
  # 컨테이너 안: 자기 태스크 자격 증명 엔드포인트에 묻고 RoleArn·Expiration 만 추림
  docker exec $c sh -c 'echo URI=$AWS_CONTAINER_CREDENTIALS_RELATIVE_URI | sed -E "s/[0-9a-f-]{20,}/<id>/"
    curl -s http://169.254.170.2$AWS_CONTAINER_CREDENTIALS_RELATIVE_URI \
    | grep -oE "\"(RoleArn|Expiration)\" *: *\"[^\"]+\""'
done
```

```text
== container: ecs-ecscape-low-1-low-ee96d8c7e8dcb380c201
URI=/v2/credentials/<id>
"RoleArn":"arn:aws:iam::<ACCOUNT_ID>:role/ecscape-lab-task-role"
"Expiration":"2026-11-25T13:22:21Z"
== container: ecs-ecscape-high-1-high-acc1ed8eaa84e4945c00
URI=/v2/credentials/<id>
"RoleArn":"arn:aws:iam::<ACCOUNT_ID>:role/ecscape-lab-high-role"
"Expiration":"2026-11-25T13:22:23Z"
```

low 컨테이너는 `ecscape-lab-task-role`, high 컨테이너는 `ecscape-lab-high-role`만 받았습니다. 자격 증명 경로는 에이전트가 태스크마다 고유한 ID로 채워 주는 값이고(기록에서는 ID를 `<id>`로 가렸습니다), 정상 동작에서는 자기 역할만 보입니다. 발표가 문제 삼는 것은 이 구조가 같은 인스턴스 위의 에이전트와 태스크가 한 경계 안에 있다는 전제 위에 있다는 점입니다.

### 단계 C. 전제 조건인 IMDS 도달은 어떻게 확인하나요?

목적은 원글이 든 전제인 IMDS 도달 가능성이 이 환경에서 성립하는지 보는 것입니다(그림 2). low 컨테이너 안에서 IMDSv2 토큰을 요청하고, 인스턴스 ID와 인스턴스 역할 이름만 조회하는 확인 스크립트입니다. 자격 증명 본문은 조회하지 않습니다.

labC-check.sh
{% raw %}
```bash
C=$(docker ps --format "{{.Names}}" | grep ecscape-low)
echo "== container: $C (low task)"
docker exec $C sh -c '
T=$(curl -s -m 3 -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60"); echo "IMDSv2 token PUT: exit=$? token_len=${#T}"
[ -n "$T" ] && { echo -n "instance-id: "; curl -s -m 3 -H "X-aws-ec2-metadata-token: $T" http://169.254.169.254/latest/meta-data/instance-id; echo;
echo -n "instance role name: "; curl -s -m 3 -H "X-aws-ec2-metadata-token: $T" http://169.254.169.254/latest/meta-data/iam/security-credentials/; echo; }'
```
{% endraw %}

기록된 출력입니다.

```text
== container: ecs-ecscape-low-1-low-ee96d8c7e8dcb380c201 (low task)
IMDSv2 token PUT: exit=0 token_len=56
instance-id: i-0cfe26e57c1c1f1c8
instance role name: ecscape-lab-instance-role
```

토큰 요청이 성공(exit=0, 길이 56)했고, 컨테이너 안에서 인스턴스 ID와 인스턴스 역할 이름(`ecscape-lab-instance-role`)까지 조회됐습니다. 인스턴스 시작 옵션이 hop limit 2였기 때문입니다. 컨테이너 환경에서는 hop limit을 2로 올리라는 문서 안내(AWS 문서)가 있어서 이 값으로 시작했습니다.

해석: 같은 인스턴스의 컨테이너가 IMDS에 닿는 상태입니다. 이 상태가 발표의 전제 조건 중 하나이므로, 방어는 이 길을 막는 것에서 시작합니다.

### 단계 D1. hop limit을 1로 낮추면 어떻게 되나요?

목적은 IMDS 응답 hop limit 설정 하나가 컨테이너의 IMDS 접근에 영향을 주는지 보는 것입니다(그림 3). 변경 전 EC2 콘솔의 인스턴스 메타데이터 옵션 창은 이랬습니다. 창을 연 채 저장하지 않고 취소한 화면으로, IMDSv2 필수와 홉 제한 2를 확인했습니다.

![EC2 인스턴스 메타데이터 옵션 수정 창]({{ '/assets/img/posts/ecscape-review/05-ec2-metadata.jpg' | relative_url }})

*메타데이터 서비스 활성화, IMDSv2 필수, HTTP PUT 응답 홉 제한 2. 저장하지 않고 취소했습니다.*

hop limit을 1로 바꾸고 같은 확인 스크립트를 다시 돌렸습니다.

```text
++ aws ec2 modify-instance-metadata-options --instance-id i-0cfe26e57c1c1f1c8 --http-put-response-hop-limit 1 --http-tokens required --query 'InstanceMetadataOptions.[HttpTokens,HttpPutResponseHopLimit]' --output text
required	1
++ set +x
== container: ecs-ecscape-low-1-low-ee96d8c7e8dcb380c201 (low task)
IMDSv2 token PUT: exit=28 token_len=0
	failed to run commands: exit status 1
```

설정 값은 `required 1`로 바뀌었고, 컨테이너의 토큰 요청은 exit=28, 토큰 길이 0이었습니다. curl 종료 코드 28은 시간 초과이므로 응답이 컨테이너에 오지 않은 것입니다. 마지막 줄 `failed to run commands: exit status 1`은 확인 스크립트가 토큰이 없을 때 비정상 종료 코드를 반환해 SSM이 남긴 메시지입니다.

해석: 컨테이너가 추가 홉이라는 문서 설명(AWS 문서)과 일치하게 hop limit 1에서 컨테이너의 IMDSv2 응답이 끊겼습니다. 다만 문서는 컨테이너 환경에서 hop limit을 2로 올리는 쪽을 호환 대책으로 안내합니다. 그래서 다음 단계에서는 값을 2로 되돌리고 다른 차단 방법을 확인했습니다.

### 단계 D2. 호스트 방화벽 규칙으로도 막을 수 있나요?

목적은 hop limit을 건드리지 않고 컨테이너의 IMDS 접근만 막는 방법을 확인하는 것입니다(그림 4). 먼저 hop limit을 2로 되돌린 뒤, bridge 모드 컨테이너의 트래픽이 지나는 Docker의 DOCKER-USER 체인에 IMDS 주소로 가는 패킷을 버리는 규칙을 넣었습니다. AWS 문서도 bridge 모드 태스크용 호스트 방화벽 규칙을 안내합니다([AWS 문서](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html), [보안 모범 사례](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-iam-roles.html)).

```text
$ aws ec2 modify-instance-metadata-options --instance-id i-0cfe26e57c1c1f1c8 --http-put-response-hop-limit 2 --http-tokens required --query 'InstanceMetadataOptions.[HttpTokens,HttpPutResponseHopLimit]' --output text | sed 's/^/hop limit restored: /'
hop limit restored: required	2
$ [host] iptables --insert DOCKER-USER 1 --in-interface docker+ --destination 169.254.169.254/32 --jump DROP
Chain DOCKER-USER (1 references)
num  target     prot opt source               destination
1    DROP       all  --  0.0.0.0/0            169.254.169.254
2    RETURN     all  --  0.0.0.0/0            0.0.0.0/0

== container: ecs-ecscape-low-1-low-ee96d8c7e8dcb380c201 (low task)
IMDSv2 token PUT: exit=28 token_len=0
	failed to run commands: exit status 1
== task credentials endpoint after block
"RoleArn":"arn:aws:iam::<ACCOUNT_ID>:role/ecscape-lab-task-role"

== host itself
host_token_len=56
ecs-agent Up 2 minutes (healthy)
```

hop limit이 2로 복원된 상태(`required 2`)에서 규칙을 넣자 컨테이너의 토큰 요청은 다시 exit=28, 토큰 길이 0이 됐습니다. 같은 때 태스크 자격 증명 엔드포인트에서는 low 컨테이너가 자기 역할 `ecscape-lab-task-role`을 받았고, 호스트 자신의 토큰 요청은 길이 56으로 성공했으며 `ecs-agent`는 healthy였습니다.

해석: 컨테이너에서 IMDS로 가는 길만 막고, 태스크 자기 역할 경로와 호스트의 IMDS 사용은 그대로입니다. 이 규칙이 막는 것은 컨테이너에서 IMDS로 가는 길이며, 같은 인스턴스의 에이전트와 태스크가 한 경계에 있다는 구조 자체를 바꾸지는 않습니다. 구조를 줄이려면 앞에서 본 권한 최소화와 워크로드 분리가 함께 필요합니다.

### 단계 E. 태스크의 호출은 CloudTrail에 어떻게 남나요?

목적은 사후 조사에서 볼 단서가 기록에 어떻게 남는지 보는 것입니다(그림 5). 공식 aws-cli 이미지로 일회성 태스크(`ecscape-cli`)를 띄워 low 태스크 역할로 S3 버킷 목록 조회를 한 번, low 역할에 허용되지 않은 EC2 인스턴스 조회를 한 번 호출했습니다. 호출 내용은 앞의 td-cli.json의 command와 같고, 출력은 다음과 같습니다.

```text
2026-11-25T07:24:33 14
2026-11-25T07:24:33 list-buckets OK
2026-11-25T07:24:34 describe-instances DENIED
2026-11-25T07:24:34 2026-11-25T07:24:34Z
```

`14`는 계정의 버킷 수이고, `list-buckets OK`는 허용된 호출 성공, `describe-instances DENIED`는 허용되지 않은 호출 거부입니다. 이 호출은 태스크가 자기 역할 자격 증명으로 한 정상 호출이며, 가로챈 자격 증명을 쓴 것이 아닙니다.

![태스크 로그 스트림의 cli 출력]({{ '/assets/img/posts/ecscape-review/09-logs-cli.jpg' | relative_url }})

*CloudWatch Logs의 cli 스트림. 14, list-buckets OK, describe-instances DENIED, 시각 2026-11-25T07:24:34Z가 보입니다.*

CloudTrail에서 같은 두 호출을 찾은 기록입니다(조회 필드만 추림).

```text
== CloudTrail ListBuckets
{"eventTime":"2026-11-25T07:24:33Z","eventName":"ListBuckets","arn":"arn:aws:sts::<ACCOUNT_ID>:assumed-role/ecscape-lab-task-role/40458c5449f3465bae6cac91344ed4d3","sourceIPAddress":"<PUBLIC_IP>","userAgent":"[aws-cli/2.42.3 md/awscrt#0.38.1 ua/2.1 ","errorCode":null}
== CloudTrail DescribeInstances
{"eventTime":"2026-11-25T07:24:34Z","eventName":"DescribeInstances","arn":"arn:aws:sts::<ACCOUNT_ID>:assumed-role/ecscape-lab-task-role/40458c5449f3465bae6cac91344ed4d3","sourceIPAddress":"<PUBLIC_IP>","userAgent":"aws-cli/2.42.3 md/awscrt#0.38.1 ua/2.1 o","errorCode":"Client.UnauthorizedOperation"}
(참고, 실측 아님) 컨테이너의 IMDS 읽기는 CloudTrail 이벤트를 만들지 않는다 — Sweet Security 블로그 Step 1 서술
```

위 출력 맨 아래 괄호 줄은 실측이 아닌 원글 서술의 메모입니다. 컨테이너에서 IMDS를 읽는 요청은 CloudTrail 이벤트를 만들지 않는다는 내용으로, 원글 Step 1에 나옵니다. 실측으로 확인한 것은 위 두 이벤트입니다. 두 이벤트 모두 사용자는 `assumed-role/ecscape-lab-task-role/<태스크 ID>`이고, 허용되지 않은 DescribeInstances는 `Client.UnauthorizedOperation`으로 기록됐습니다. 시각은 UTC이며 07시 24분은 한국 시각 16시 24분입니다. 콘솔의 이벤트 기록에서도 확인했습니다.

![CloudTrail 이벤트 기록의 ListBuckets 목록]({{ '/assets/img/posts/ecscape-review/10-cloudtrail-list.jpg' | relative_url }})

*이벤트 기록의 ListBuckets 한 줄. 사용자 이름이 태스크 ID이고 이벤트 소스는 s3.amazonaws.com입니다.*

![ListBuckets 이벤트 레코드]({{ '/assets/img/posts/ecscape-review/11-cloudtrail-detail.jpg' | relative_url }})

*userIdentity.type은 AssumedRole, sessionIssuer.userName은 ecscape-lab-task-role, creationDate는 2026-11-25T07:24:22Z입니다. inScopeOf의 issuerType은 `AWS::ECS::Task`, credentialsIssuedTo는 태스크 ARN입니다.*

![DescribeInstances 이벤트 레코드]({{ '/assets/img/posts/ecscape-review/12-cloudtrail-describe.jpg' | relative_url }})

*같은 inScopeOf(AWS::ECS::Task)를 가진 DescribeInstances 이벤트. eventTime 07:24:34Z, sourceIPAddress <PUBLIC_IP>, errorCode Client.UnauthorizedOperation, readOnly true입니다.*

조사 관점에서 볼 점은 레코드의 `inScopeOf` 필드입니다. `issuerType`이 `AWS::ECS::Task`이고 `credentialsIssuedTo`에 이 자격 증명이 발급된 태스크의 ARN이 적혀 있습니다. 원글은 가로챈 자격 증명의 사용이 피해 태스크의 역할로 귀속된다고 적었습니다. 그렇다면 로그의 호출자가 어느 역할인지만 보면 정상 호출과 구분되지 않을 수 있으므로, 자격 증명이 발급된 태스크와 호출이 나온 환경(IP, 시각, API 종류)이 맞는지 대조하는 것이 조사의 출발점이 됩니다. 이 실습에서 직접 확인한 것은 필드가 기록된다는 사실입니다.

### 단계 F. Fargate에서는 같은 확인이 어떻게 달라지나요?

목적은 인스턴스를 공유하지 않는 환경과 비교하는 것입니다(그림 6). Fargate 태스크(`ecscape-fargate`, awsvpc)가 IMDS 주소와 태스크 자격 증명 엔드포인트에 요청하도록 정의에 명령을 넣었고, 로그를 확인했습니다. 앞에서 본 td-fargate.json의 command가 그 명령입니다.

```text
2026-11-25T07:25:16 [IMDS 169.254.169.254]
2026-11-25T07:25:16 http=000 exit=7
2026-11-25T07:25:16 [task credentials endpoint]
2026-11-25T07:25:16 AWS_CONTAINER_CREDENTIALS_RELATIVE_URI=set:yes
2026-11-25T07:25:16 http=200
```

IMDS 요청은 연결 자체가 되지 않았고(`http=000`, curl 종료 코드 7은 연결 실패), 태스크 자격 증명 엔드포인트는 환경 변수가 설정되어 있고 응답 코드 200이었습니다.

![Fargate 태스크의 CloudWatch 로그]({{ '/assets/img/posts/ecscape-review/08-logs-fargate.jpg' | relative_url }})

*/ecs/ecscape-lab의 fargate 스트림. IMDS는 http=000 exit=7, 태스크 자격 증명 엔드포인트는 http=200입니다.*

해석: Fargate 태스크에서는 IMDS에 닿지 않고 자기 태스크 역할 경로만 쓸 수 있었습니다. Fargate 태스크는 커널·CPU·메모리·ENI를 다른 태스크와 공유하지 않는다는 AWS 문서, 인스턴스 공동 사용이 없어 ECScape가 해당하지 않는다는 원글의 설명과 맞는 관찰입니다.

### 정리. 만든 것은 모두 지웠나요?

실습이 끝난 뒤 실행 중인 태스크를 멈추고 인스턴스를 종료하는 것부터 시작해 만든 순서의 반대로 지웠습니다. 기록은 다음과 같습니다(`set -x`가 켜져 있어 `++`가 붙은 줄이 실행한 명령입니다).

```text
+++ aws ecs list-tasks --cluster ecscape-lab --desired-status RUNNING --query 'taskArns[]' --output text
++ for t in $(aws ecs list-tasks --cluster ecscape-lab --desired-status RUNNING --query 'taskArns[]' --output text)
++ aws ecs stop-task --cluster ecscape-lab --task arn:aws:ecs:ap-northeast-2:<ACCOUNT_ID>:task/ecscape-lab/518d30079864453089ce5fa6dce00fdc --query task.lastStatus --output text
RUNNING
++ for t in $(aws ecs list-tasks --cluster ecscape-lab --desired-status RUNNING --query 'taskArns[]' --output text)
++ aws ecs stop-task --cluster ecscape-lab --task arn:aws:ecs:ap-northeast-2:<ACCOUNT_ID>:task/ecscape-lab/e39679366f784bda870fda58b95699cd --query task.lastStatus --output text
RUNNING
++ aws ec2 terminate-instances --instance-ids i-0cfe26e57c1c1f1c8 --query 'TerminatingInstances[0].CurrentState.Name' --output text
shutting-down
++ aws ec2 wait instance-terminated --instance-ids i-0cfe26e57c1c1f1c8
++ aws ec2 delete-security-group --group-id sg-071d31f7c5b7a4a4d
{
    "Return": true,
    "GroupId": "sg-071d31f7c5b7a4a4d"
}
++ for f in low high fargate cli
++ aws ecs deregister-task-definition --task-definition ecscape-low:1 --query taskDefinition.status --output text
INACTIVE
++ for f in low high fargate cli
++ aws ecs deregister-task-definition --task-definition ecscape-high:1 --query taskDefinition.status --output text
INACTIVE
++ for f in low high fargate cli
++ aws ecs deregister-task-definition --task-definition ecscape-fargate:1 --query taskDefinition.status --output text
INACTIVE
++ for f in low high fargate cli
++ aws ecs deregister-task-definition --task-definition ecscape-cli:1 --query taskDefinition.status --output text
INACTIVE
++ aws ecs delete-task-definitions --task-definitions ecscape-low:1 ecscape-high:1 ecscape-fargate:1 ecscape-cli:1 --query 'taskDefinitions[].status' --output text
DELETE_IN_PROGRESS	DELETE_IN_PROGRESS	DELETE_IN_PROGRESS	DELETE_IN_PROGRESS
++ aws ecs delete-cluster --cluster ecscape-lab --query cluster.status --output text
INACTIVE
++ aws iam remove-role-from-instance-profile --instance-profile-name ecscape-lab-profile --role-name ecscape-lab-instance-role
++ aws iam delete-instance-profile --instance-profile-name ecscape-lab-profile
++ aws iam detach-role-policy --role-name ecscape-lab-instance-role --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role
++ aws iam detach-role-policy --role-name ecscape-lab-instance-role --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
++ aws iam delete-role --role-name ecscape-lab-instance-role
++ aws iam delete-role-policy --role-name ecscape-lab-task-role --policy-name list-buckets-only
++ aws iam delete-role --role-name ecscape-lab-task-role
++ aws iam delete-role-policy --role-name ecscape-lab-high-role --policy-name describe-instances-only
++ aws iam delete-role --role-name ecscape-lab-high-role
++ aws iam detach-role-policy --role-name ecscape-lab-exec-role --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
++ aws iam delete-role --role-name ecscape-lab-exec-role
++ aws logs delete-log-group --log-group-name /ecs/ecscape-lab
++ set +x
```

삭제 확인 결과입니다.

```text
== 삭제 확인
EC2: terminated
SG: 0
ECS cluster: INACTIVE
ECS task defs (ACTIVE, ecscape): 0
IAM roles: 0
Instance profile: 0
Log group: 0
```

EC2는 terminated, 보안 그룹은 0개, 클러스터는 INACTIVE이고, 활성 태스크 정의(ecscape), IAM 역할, 인스턴스 프로파일, 로그 그룹은 모두 0개입니다.

## 실습 결과를 한눈에 보면 어떤가요?

| 설정 | 컨테이너에서 IMDS | 태스크 자격 증명 |
|---|---|---|
| EC2, hop limit 2, 차단 없음 (단계 B, C) | 접근됨. 토큰 길이 56, 인스턴스 ID와 인스턴스 역할 이름 조회됨 | 컨테이너마다 자기 역할 ARN만 확인됨 |
| EC2, hop limit 1 (단계 D1) | 응답 안 옴. exit=28, 토큰 길이 0 | — |
| EC2, hop limit 2 + DOCKER-USER DROP (단계 D2) | 응답 안 옴. exit=28, 토큰 길이 0 | low 컨테이너가 자기 역할 ARN을 받음. 호스트의 IMDS 사용과 에이전트는 정상 |
| Fargate, awsvpc (단계 F) | 연결 안 됨. http=000, exit=7 | 응답 코드 200 |

이 실습이 보여 주는 것은 전제 조건(같은 인스턴스, 컨테이너에서 IMDS 도달)과 그 길을 막는 두 지점, 그리고 호출이 CloudTrail에 남는 모습입니다.

## 처음 질문에 다 답했나요? (되돌아보기)

| 처음 질문 | 답 | 근거 |
|---|---|---|
| Q1. 탈출 없이 다른 태스크 역할을 얻는다는 건? | 컨테이너 격리를 깨는 것이 아니라, 같은 인스턴스에서 태스크와 에이전트가 한 신뢰 경계에 있다는 구조에서 태스크가 에이전트처럼 행동할 수 있다는 뜻 | [슬라이드 128쪽], [슬라이드 62쪽], 원글 TL;DR |
| Q2. 어떤 조건에서 성립하나? | ECS on EC2, 권한이 다른 태스크가 같은 인스턴스, 손상된 저권한 컨테이너, IMDS 도달. 별도 오설정은 필요 없음. 실습에서 같은 인스턴스의 서로 다른 역할과 컨테이너의 IMDS 도달을 확인 | 원글 TL;DR, [슬라이드 95쪽], 실습 단계 B, C |
| Q3. 무엇을 얻을 수 있나? | 같은 인스턴스 더 높은 권한 태스크의 역할, 실행 역할과 ECS 내부 정보, 멀티테넌트에서는 테넌트 간 침범 | [슬라이드 87~95쪽], 원글 TL;DR |
| Q4. AWS와 언론의 평가가 왜 다른가? | AWS는 컨테이너가 보안 경계가 아니라는 원칙에서 설계상 고려 사항으로 보고 문서를 고쳤으며, 언론은 기본 설정에서 성립한다는 점을 flaw로 표현. 문서는 다른 태스크 자격 증명에 접근하지 못한다는 취지에서 접근할 수 있다는 내용으로 바뀜 | [슬라이드 124쪽], [슬라이드 127쪽], 원글 Responsible Disclosure 절, CSO Online 기사 본문 |
| Q5. 어떻게 막나? | 태스크의 IMDS 접근 차단, 권한 최소화, 고권한 태스크 분리, Fargate. 실습에서는 hop limit 1과 DOCKER-USER 규칙으로 컨테이너의 IMDS 응답이 끊기는 것을 확인. IMDS 차단 외의 대책과 함께 사용 | [슬라이드 114~121쪽], [슬라이드 127쪽], AWS 문서, 실습 단계 D1, D2 |
| Q6. 어떻게 알아채나? | CloudTrail에서 태스크 역할로 귀속되는 호출 중 평소와 다른 API, 시각, 환경을 찾음. 레코드의 `inScopeOf.credentialsIssuedTo`로 발급된 태스크를 확인. IMDS 읽기는 CloudTrail에 남지 않는다는 원글 서술 | 원글 Impact·Mitigation 절, 실습 단계 E (캡처 11, 12) |
| Q7. Fargate는 왜 다른가? | 태스크마다 격리 경계를 갖고 인스턴스를 공유하지 않아 해당하지 않음. 실습에서 IMDS 연결 실패, 태스크 자격 증명 경로만 응답 | 원글 Mitigation 절, AWS 문서(A2), 실습 단계 F |

## 무엇을 배웠고 다음에는 무엇을 할까요?

- ECS on EC2에서 태스크는 격리된 경계가 아니라 같은 인스턴스를 쓰는 이웃입니다. 권한이 다른 태스크를 한 인스턴스에 같이 두는 설계를 먼저 점검해야 합니다.
- IMDS로 가는 길은 설정(hop limit)과 호스트 규칙(DOCKER-USER) 두 곳에서 막히는 것을 직접 봤습니다. D2에서는 막은 뒤에도 태스크 역할 경로와 호스트의 IMDS, 에이전트가 정상인 것을 함께 확인했습니다. 막는 방법을 바꿀 때마다 이 확인을 같이 해야 합니다.
- 같은 사실도 AWS의 설계 원칙과 언론의 표현이 달랐습니다. 평가를 받아들이기 전에 문서의 전후 변화와 책임 범위를 같이 읽는 습관이 필요합니다.
- CloudTrail 레코드의 `inScopeOf` 필드는 조사에서 호출을 태스크와 연결하는 단서가 됩니다.
- 앞으로는 awsvpc 모드에서 `ECS_AWSVPC_BLOCK_IMDS`를 켠 설정을 같은 방식으로 확인해 보고, 후보였던 다른 발표(Shadow Resources, Kicking in the Door to the Cloud)도 읽어 보려고 합니다.
- 직전에 진행한 EKS 컨테이너 포렌식 프로젝트(클라우드 포렌식)와 같은 컨테이너·IAM 주제여서, 이 글의 CloudTrail 단서는 그 프로젝트에서 다시 만날 수 있습니다.

## 참고

- 영상: Black Hat USA 2025 | ECS-cape – Hijacking IAM Privileges in Amazon ECS, <https://www.youtube.com/watch?v=UV-hS-DTeik>
- 발표 정보: <https://citation.thinkst.com/talk/98406>
- 슬라이드(129쪽): <https://i.blackhat.com/BH-USA-25/Presentations/US-25-Haziz-ECS-cape-Hijacking-IAM-Privileges-in-Amazon-ECS-Wednesday.pdf>
- 원글(Sweet Security, 2025-08-06): <https://www.sweet.security/blog/ecscape-understanding-iam-privilege-boundaries-in-amazon-ecs>
- AWS 문서, 태스크 IAM 역할: <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html>
- AWS 문서, ECS 보안 모범 사례(IAM 역할): <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-iam-roles.html>
- AWS 보안 블로그, Security considerations for running containers on Amazon ECS: <https://aws.amazon.com/blogs/security/security-considerations-for-running-containers-on-amazon-ecs/>
- AWS 문서, 인스턴스 메타데이터 조회: <https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html>
- AWS 문서, 인스턴스 메타데이터 옵션: <https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-options.html>
- CSO Online 기사: <https://www.csoonline.com/article/4036655/ecscape-new-aws-ecs-flaw-lets-containers-hijack-iam-roles-without-breaking-out.html>
