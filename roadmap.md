---
title: 클라우드 보안 진로 로드맵
permalink: /roadmap/
description: AWS 취업을 목표로 한 단계별 개인 학습 계획
---

> **출처 확인 상태 안내 (2026-10-28)**
> 이 페이지를 만든 실행에서는 웹 문서를 직접 열 수 없었습니다.
> 그래서 AWS 서비스·인증·직무에 대한 설명에는 모두 **(미확인)** 을 붙이고, 확인할 AWS 공식 페이지 링크를 옆에 달았습니다.
> 링크를 직접 열어 내용이 맞는지 확인한 뒤 "(미확인)"을 지우고 확인 날짜를 적으세요.
> 시험 문항 수·비용·시간처럼 자주 바뀌는 수치는 일부러 넣지 않았습니다.

```text
[1] 기초 ──> [2] AWS 핵심 서비스·IAM ──> [3] AWS 보안 서비스
                                               │
[6] 지원 <── [5] 실습·포트폴리오 <── [4] 자격증 ┘
```

## 1단계 — 기초: 네트워크 · OS · 웹 · 리눅스

클라우드 보안도 결국 네트워크, 운영체제, 웹 위에서 동작하므로 기초부터 다집니다. (학습 방향, 사실 주장 아님)

- **네트워크**: OSI/TCP-IP 계층, IP·서브넷·CIDR, 라우팅, DNS, HTTP/HTTPS, TLS 개념
- **운영체제**: 프로세스, 메모리, 파일 권한, 사용자·그룹
- **리눅스**: 셸 명령, 권한(chmod/chown), 로그 위치, 패키지 관리, SSH
- **웹**: 요청·응답 구조, 쿠키·세션, 인증과 인가의 차이, OWASP Top 10 같은 대표 웹 취약점 유형 — 목록은 [OWASP Top 10](https://owasp.org/www-project-top-ten/) 에서 확인 (미확인)
- 블로그 연결: 정리한 내용은 [블로그/기술문서]({{ '/categories/tech-docs/' | relative_url }}), 연습은 [CTF/Wargame]({{ '/categories/ctf-wargame/' | relative_url }})

## 2단계 — AWS 핵심 서비스 · IAM

아래 서비스 설명은 일반적으로 알려진 역할이며, 이 실행에서 원문을 확인하지 못했습니다.

| 서비스 | 알려진 역할 (확인 필요) | 확인할 공식 문서 |
|---|---|---|
| IAM | 사용자·그룹·역할·정책으로 AWS 리소스 접근을 제어 (미확인) | [IAM 사용 설명서](https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html) |
| Amazon EC2 | 가상 서버(인스턴스) 실행 (미확인) | [EC2 문서](https://docs.aws.amazon.com/ec2/) |
| Amazon S3 | 객체 스토리지 (미확인) | [S3 문서](https://docs.aws.amazon.com/s3/) |
| Amazon VPC | 격리된 가상 네트워크, 서브넷·라우팅·보안 그룹 (미확인) | [VPC 문서](https://docs.aws.amazon.com/vpc/) |
| AWS Organizations | 여러 계정을 묶어 관리 (미확인) | [Organizations 문서](https://docs.aws.amazon.com/organizations/) |

공부할 것 (학습 방향):

- 최소 권한 원칙으로 IAM 정책 읽기·쓰기 연습
- 루트 계정을 일상 작업에 쓰지 않고 MFA를 거는 것 같은 권장 사항 — [IAM 보안 모범 사례](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) 에서 확인 (미확인)
- 공동 책임 모델(AWS와 고객의 보안 책임 구분) — [공동 책임 모델](https://aws.amazon.com/compliance/shared-responsibility-model/) 에서 확인 (미확인)
- 실습 비용이 생길 수 있으므로 프리 티어 조건과 결제 알림 설정을 먼저 확인 — [AWS 프리 티어](https://aws.amazon.com/free/) (미확인)

## 3단계 — AWS 보안 서비스

| 서비스 | 알려진 역할 (확인 필요) | 확인할 공식 문서 |
|---|---|---|
| AWS CloudTrail | 계정의 API 호출 기록 (미확인) | [CloudTrail 문서](https://docs.aws.amazon.com/cloudtrail/) |
| AWS Config | 리소스 설정 기록과 규칙 평가 (미확인) | [Config 문서](https://docs.aws.amazon.com/config/) |
| Amazon GuardDuty | 위협 탐지 (미확인) | [GuardDuty 문서](https://docs.aws.amazon.com/guardduty/) |
| AWS Security Hub | 보안 발견 사항 통합·점검 (미확인) | [Security Hub 문서](https://docs.aws.amazon.com/securityhub/) |
| AWS KMS | 암호화 키 관리 (미확인) | [KMS 문서](https://docs.aws.amazon.com/kms/) |
| Amazon Inspector | 취약점 스캔 (미확인) | [Inspector 문서](https://docs.aws.amazon.com/inspector/) |
| Amazon Macie | S3 의 민감 데이터 탐지 (미확인) | [Macie 문서](https://docs.aws.amazon.com/macie/) |
| AWS WAF / AWS Shield | 웹 요청 필터링 / DDoS 대응 (미확인) | [WAF·Shield 문서](https://docs.aws.amazon.com/waf/) |

공부할 것 (학습 방향):

- 로그(CloudTrail 등)를 켜고 "누가 무엇을 했는지" 직접 찾아보기
- 잘못된 설정(공개 S3 버킷, 과한 IAM 권한)을 일부러 만든 뒤 탐지·수정해 보기 — 반드시 **내 계정** 안에서만
- 전체 개요: [AWS 보안 문서 모음](https://docs.aws.amazon.com/security/) (미확인)

## 4단계 — 자격증

AWS 인증의 이름·레벨·구성은 바뀔 수 있으므로 반드시 [AWS Certification 공식 페이지](https://aws.amazon.com/certification/) 에서 직접 확인합니다.
아래는 확인할 후보 목록이며 이름과 레벨은 모두 **(미확인)** 입니다.

- 기초 레벨: AWS Certified Cloud Practitioner (미확인)
- 어소시에이트 레벨: AWS Certified Solutions Architect – Associate 등 (미확인)
- 전문 분야(Specialty) 레벨: 보안 분야 인증 — 정확한 이름과 현재 제공 여부 (미확인)

확인 방법: 각 인증 페이지의 시험 안내서(exam guide)에서 출제 영역을 보고, 2·3단계 공부 범위와 맞춰 봅니다. 문항 수·비용·시간은 응시 직전에 공식 페이지에서 다시 확인합니다.

## 5단계 — 실습 · 포트폴리오

- 내 AWS 계정에서 작은 보안 실습 환경을 만들고 과정을 [개발]({{ '/categories/dev/' | relative_url }})·[기술문서]({{ '/categories/tech-docs/' | relative_url }})에 기록
  - 예: 최소 권한 IAM 역할 설계, 로그 수집·알림 구성, 잘못된 설정 탐지와 수정
- 인프라를 코드로 관리해 보고(예: AWS CloudFormation — [문서](https://docs.aws.amazon.com/cloudformation/) (미확인)), 코드를 GitHub 에 정리
- 공개 허용된 CTF·워게임 풀이, 읽은 논문 정리를 꾸준히 올리기
- 버그바운티는 **프로그램이 승인한 scope 안에서만** 활동하고 공개 허용된 내용만 기록
- 실습 계정의 접속 키·개인정보가 저장소나 글에 들어가지 않게 확인

## 6단계 — 지원

- 채용 공고는 [AWS 채용 사이트](https://www.amazon.jobs/) 에서 직접 확인합니다. 클라우드 보안과 관련된 직무명과 요구 사항은 공고마다 다르므로 여기에 단정하지 않습니다 (미확인).
- 공고의 요구 사항을 1~5단계 기록과 비교해 부족한 부분을 다시 공부합니다.
- 이 블로그의 글과 GitHub 저장소를 포트폴리오로 정리해 지원서에 연결합니다.

---

**이 로드맵은 개인 학습 계획이며 결과를 보장하지 않음.**
작성·확인 날짜: 2026-10-28 (이 날짜 기준 출처 원문 미열람, 모든 사실 항목 미확인 상태)
