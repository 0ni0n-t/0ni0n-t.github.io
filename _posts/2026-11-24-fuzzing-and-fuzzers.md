---
title: "[Bug Bounty] 퍼저와 퍼징 — 처음부터 개념을 잡고 AFL++로 크래시를 직접 찾아보기"
category: bug-bounty
sub: "방법론"
description: "퍼징이 무엇인지 처음 보는 사람 기준으로 풀고, 퍼징의 종류와 AFL++·libFuzzer·Jackalope의 차이를 정리했습니다. AFL++를 직접 빌드해 일부러 버그를 넣은 프로그램에서 크래시를 찾는 과정과 실측값도 담았습니다."
---

이 글의 실습은 제 서버 안의 로컬 예제 프로그램에만 했습니다. 외부 대상은 건드리지 않았습니다. 실행 출력에서 사용자 이름은 `[가림]`으로 바꿨고, 색상 제어 문자는 지웠습니다. 그 밖의 내용은 로그 파일 원문 그대로입니다.

## 0. 이 주제를 고른 이유

지금 QEMU 가상 머신의 이상 행위를 eBPF로 탐지하는 도구를 만들고 있고, 버그바운티도 공부하고 있습니다. 두 일 모두 같은 질문으로 이어집니다. 사람이 코드를 읽어서는 놓치는 버그를 기계가 대신 찾아 줄 수는 없을까? 이 질문의 대표적인 답이 퍼징이라고 해서, 이번 미션에서 기초부터 공부하기로 했습니다.

이 글은 퍼징을 전혀 모르는 사람이 읽어도 따라올 수 있게 쓰는 것이 목표입니다. 지침이 된 자료는 미션에서 안내한 AFL++, Jackalope, Google의 fuzzing 저장소이고, 퍼저 설명은 각 공식 문서에서 직접 읽어 확인한 내용만 썼습니다.

## 1. 읽기 전 질문

| 이 글에서 답할 질문 | 짧은 답 |
|---|---|
| 퍼징이 뭔가? | 프로그램에 이상한 입력을 아주 많이, 자동으로 넣어서 죽거나 이상 신호를 내는 순간을 찾는 일입니다 (2장) |
| 왜 버그가 찾아지나? | 개발자가 생각하지 못한 입력에서 프로그램이 약속을 어기기 때문입니다 (2장) |
| 퍼징에는 어떤 종류가 있나? | 입력 생성, 대상 내부를 아는 정도, 피드백 사용 여부, 실행 방식의 네 기준으로 나눌 수 있습니다 (3장) |
| AFL++, libFuzzer, Jackalope는 뭐가 다른가? | 계측을 하는 시점과 대상을 돌리는 방식이 다릅니다 (4·5장) |
| 직접 돌려 보면 어떻게 되나? | 4바이트 비밀번호를 맞혀야 열리는 버그를 AFL++가 1.6초 만에 찾았고, 피드백 없이 돌린 쪽은 2분 동안 못 찾았습니다 (6장) |

## 2. 퍼징이란

### 비유로 먼저

자판기를 검사하는 사람을 떠올려 봅니다. 정상적인 사용법은 동전을 넣고 버튼을 누르는 것입니다. 그런데 검사원이 동전 대신 단추, 영수증, 껌을 넣고, 버튼을 한꺼번에 눌러 보고, 뒤집어 보면 설계자가 생각하지 못한 고장이 드러날 수 있습니다. 퍼징은 이 일을 프로그램에 대해 기계가 쉬지 않고 수백만 번 하는 것입니다.

![퍼저의 기본 반복. 입력 만들기, 실행, 감시, 저장의 네 단계를 거치고, 죽지 않았다면 다시 입력 만들기로 돌아가는 그림]({{ '/assets/img/posts/fuzzing-basic-loop.svg' | relative_url }})

1. 입력 만들기: 씨앗 입력(seed)을 조금씩 바꿔 새 입력을 만듭니다.
2. 실행: 대상 프로그램에 그 입력을 넣고 돌립니다.
3. 감시: 프로그램이 비정상적으로 끝났는지 지켜봅니다.
4. 저장: 죽은 입력은 파일로 저장해 둡니다. 나중에 같은 입력으로 다시 재현해 원인을 분석합니다.

### 왜 이걸로 버그가 찾아지나

프로그램은 입력이 이런 모양일 것이라는 가정 위에서 만들어집니다. 예를 들어 이름은 16글자 이하일 것이라고 가정하고 16칸짜리 상자를 마련합니다. 가정을 벗어난 입력이 들어왔을 때 길이를 검사하지 않고 그대로 복사하면 상자를 넘쳐서 옆의 메모리를 덮어씁니다(버퍼 오버플로). 퍼징은 이런 가정 밖의 입력을 사람이 상상하는 속도와 양을 훨씬 넘어서 대 줍니다.

### 용어 풀이

| 용어 | 뜻 |
|---|---|
| 퍼저(fuzzer) | 위의 반복을 자동으로 돌리는 도구입니다 |
| 대상(target) | 시험당하는 프로그램이나 함수입니다. Google 용어집은 퍼징을 적용하는 함수를 fuzz target이라고 부릅니다 |
| 씨앗(seed) | 퍼징을 시작할 때 주는 입력입니다. Google 용어집은 처음 커버리지를 확보할 목적으로 준비한 작은 입력 모음을 seed corpus라고 부릅니다 |
| 코퍼스(corpus) | 입력 모음입니다. 퍼징 중에 쓸모 있는 입력이 계속 추가됩니다 |
| 크래시(crash), hang | 크래시는 대상이 비정상 종료한 일이고, hang은 정해진 시간 안에 끝나지 않는 일입니다. 둘 다 관찰된 현상이고 원인은 재현과 분석으로 확인해야 합니다. 퍼저가 버그의 신호로 보는 것은 크래시만이 아니고, 새니타이저 보고나 assertion 실패 같은 것도 있습니다. 메모리 접근 오류(SIGSEGV)나 스스로 중단(SIGABRT) 같은 신호가 대표적입니다 |
| 새니타이저(sanitizer) | 실행 중 버그를 감지하는 도구입니다. Google 용어집은 ASan, MSan, UBSan을 예로 듭니다. 새니타이저 종류와 계측 범위에 따라 조용히 넘어갈 수 있던 일부 오류를 크래시나 보고로 드러내 줍니다. 모든 오류를 잡는 것은 아닙니다. 또 새니타이저 보고가 항상 프로세스 종료를 뜻하는 것은 아니고, 설정에 따라 보고하고 계속 실행하기도 합니다 |
| 하네스(harness) | 퍼저가 대상에 입력을 넣을 수 있게 이어 주는 작은 코드입니다 (일반적으로 쓰이는 용어입니다. Google 용어집에는 harness 항목이 없어서 같은 뜻의 fuzz target 항목을 대신 인용했습니다) |
| 계측(instrumentation) | 대상이 실행되면서 어느 코드를 지나갔는지 알려 주도록 심어 두는 장치입니다 |
| 커버리지(coverage) | 실행된 코드의 범위입니다. 어느 길을 지나갔는지로 셉니다 |

## 3. 퍼징의 종류

퍼징은 한 가지 방식이 아니라 몇 가지 기준으로 나뉩니다. 네 기준으로 정리했습니다.

![퍼징을 나누는 네 가지 기준. 입력 생성 방식, 대상 내부를 아는 정도, 피드백 사용 여부, 실행 방식]({{ '/assets/img/posts/fuzzing-taxonomy.svg' | relative_url }})

### ① 입력을 어떻게 만드나

- mutation 기반: 이미 가진 입력(씨앗)을 조금씩 변형합니다. 글자 하나 바꾸기, 일부 지우기, 늘리기 같은 연산입니다. 씨앗만 있으면 시작할 수 있습니다.
- generation 기반: 입력 형식의 규칙이나 문법을 알려 주고, 그 규칙에 맞는 입력을 처음부터 만듭니다. 형식이 엄격한 입력에서 처음부터 틀린 입력만 나오는 문제를 피할 수 있지만(그렇다고 항상 유효한 입력만 만드는 것은 아니고, 일부러 규칙을 어긋나게 만드는 경우도 있습니다), 규칙은 보통 사람이 문법이나 명세로 주고, 도구가 입력 예에서 추론하는 경우도 있습니다.

### ② 대상 속을 얼마나 아나

- black-box: 입력과 출력만 봅니다. 대상 안에서 무슨 일이 일어나는지 모릅니다.
- grey-box: 소스 전체는 분석하지 않지만, 실행 중에 어느 코드 길을 지났는지 같은 가벼운 정보를 얻어 씁니다. AFL++와 libFuzzer가 이쪽입니다.
- white-box: 소스나 프로그램 분석으로 이 분기를 통과할 입력을 계산해 만듭니다. 분석 비용이 크고 경로 폭발(분기가 늘면 따져야 할 경로가 폭발적으로 늘어나는 문제) 같은 한계가 있습니다. 이 글에서 다루는 세 퍼저는 white-box가 아니어서, white-box 도구는 직접 확인하지 않았습니다.

### ③ 실행 결과를 되먹이나

- blind(맹목) 퍼징: 입력을 변형해서 넣고, 결과가 어땠는지는 입력 만드는 데 쓰지 않습니다.
- coverage-guided 퍼징: 입력이 새로운 코드 길을 열었는지 확인해, 주로 새 커버리지를 연 입력을 코퍼스에 남기고 그것을 다음 변형의 재료로 씁니다(남기는 기준은 퍼저와 설정에 따라 다를 수 있습니다). libFuzzer 문서가 스스로를 coverage-guided, evolutionary 엔진이라고 설명하듯 이 방식이 널리 쓰입니다.

![coverage-guided 피드백 루프. 입력 저장소에서 골라 변형하고, 계측된 대상을 실행해, 새 길을 열었으면 저장소에 추가하고 아니면 버리는 흐름]({{ '/assets/img/posts/fuzzing-coverage-loop.svg' | relative_url }})

왜 이게 중요한지는 6장 실습에서 숫자로 확인합니다. 4개의 글자 `F`, `U`, `Z`, `Z`를 차례로 맞혀야 열리는 버그가 있다고 해 봅시다. 맹목적으로 변형하면 4글자를 한꺼번에 맞혀야 해서 확률이 256의 4제곱, 약 43억 분의 1입니다(4바이트를 균등하고 독립적으로 한 번에 맞힌다고 본 단순 계산이고, 실제 변형 방식은 이보다 복잡합니다). coverage-guided라면 첫 글자 `F`를 맞힌 순간 새 길이 열렸으므로 그 입력이 남고, 그걸 재료로 두 번째 글자를 맞히고, 이렇게 한 글자씩 풀릴 수 있습니다. 계측이 이 비교 단계의 차이를 관찰하고 그 입력이 보존될 때의 예이고, 항상 이렇게 되는 것은 아닙니다.

### ④ 어떻게 실행하나

- fork 방식: 입력 하나마다 새 프로세스를 만들어 실행합니다. 대상이 망가져도 다음 시도에 프로세스 메모리 상태로는 영향이 없지만(파일 같은 외부 상태는 별개입니다) 프로세스를 만드는 비용이 큽니다. fork 서버는 서버가 시작된 지점까지의 초기화를 재사용해 매번 프로그램을 처음부터 띄우는 비용을 줄이는 방식입니다. 그 지점 뒤의 초기화는 자식 프로세스마다 반복될 수 있고, 시작 지점은 기본값과 설정에 따라 다릅니다. AFL++도 fork 서버라는 방식으로 이 비용을 줄입니다(실습 로그에도 fork server가 올라왔다는 줄이 나옵니다).
- persistent 방식: 프로세스 하나를 계속 두고 그 안에서 대상 함수를 여러 번 호출합니다. 훨씬 빠르지만 대상이 호출 사이에 상태를 완전히 되돌려 놓아야 합니다. AFL++ 문서는 이 방식이 보통 10~20배 빠르다고 적고 있는데, 제가 측정한 값은 아닙니다.
- in-process 방식: 퍼저 엔진이 대상과 같은 프로세스에 합쳐져 함수를 직접 호출합니다. libFuzzer가 이쪽입니다.

## 4. 퍼저 3개

미션에서 안내한 참고 자료 중 퍼저인 AFL++와 Jackalope, 그리고 Google 저장소에서 많이 쓰이는 libFuzzer를 골랐습니다. 아래 설명은 각 공식 문서에서 읽은 내용을 풀어 쓴 것이고, 직접 확인하지 못한 것은 그렇다고 적었습니다.

![세 퍼저의 구조 비교. AFL++는 컴파일할 때 계측하고 별도 프로세스에서 실행, libFuzzer는 같은 프로세스 안에서 함수를 호출, Jackalope는 이미 만들어진 바이너리를 실행 중에 계측]({{ '/assets/img/posts/fuzzing-three-fuzzers.svg' | relative_url }})

### AFL++

- 정체: Michal Zalewski의 AFL을 이어받은 포크입니다. README는 AFL보다 속도, 변형 방식, 계측이 더 낫다고 소개합니다.
- 동작: 대상을 `afl-cc`로 컴파일해 계측을 넣고, `afl-fuzz`가 씨앗을 넣고 돌리며 새 길을 연 입력을 남깁니다. 크래시와 hang(멈춤)은 출력 디렉터리에 저장됩니다(README의 빠른 시작).
- 소스가 없을 때: 저장소에 `qemu_mode`, `frida_mode`, `unicorn_mode` 같은 디렉터리가 있습니다. 바이너리 전용 문서는 QEMU 모드가 `afl-fuzz -Q`로 쓰는 가장 쉬운 방법이고 속도가 약 50% 줄어든다고, Frida 모드는 `-O`로 쓰며 대개 QEMU 모드보다 약간 빠르고 macOS에서도 동작한다고 적고 있습니다. 이 속도 값은 문서의 주장이고 제가 확인하지는 않았습니다.
- persistent 모드: 소스 계측 쪽 문서는 `__AFL_LOOP` 같은 매크로로 쓰는 방법을 설명하고, 그 문서의 매크로 방식은 afl-clang-fast 기준입니다. 바이너리 전용 문서는 QEMU 모드와 Frida 모드에서도 persistent 모드를 쓰면 더 빠르다고 적고 있습니다.
- 장점: 소스가 있는 경우(컴파일 시 계측)와 없는 경우(QEMU·Frida 등)를 모두 다룰 수 있습니다.
- 단점: 소스 계측을 쓰려면 지원하는 컴파일러가 필요합니다. 제 서버에서는 이것이 막혔습니다(6장). 가장 빠른 길인 persistent 모드는 대상이 상태를 되돌려야 합니다.

### libFuzzer

- 정체: LLVM에 들어 있는 in-process, coverage-guided, evolutionary 퍼징 엔진입니다.
- 동작: 퍼저를 대상 라이브러리에 링크해서 합칩니다. 개발자가 `LLVMFuzzerTestOneInput(const uint8_t *Data, size_t Size)` 함수를 작성하면 엔진이 이 함수에 입력을 계속 넘겨 줍니다. 계측은 LLVM의 SanitizerCoverage가 담당하므로, 커버리지는 그 계측을 켜고 컴파일한 코드에서만 얻어집니다. 빌드는 `clang -g -O1 -fsanitize=fuzzer,address mytarget.c` 형태입니다.
- 장점: 함수 하나를 같은 프로세스에서 반복 호출해 매우 빠르고, 개발자가 직접 입력 통로를 만들므로 라이브러리 내부 함수를 바로 시험하기 좋습니다. 새니타이저와 함께 쓰기 쉽습니다.
- 단점: libFuzzer는 Clang과 버전이 맞아야 한다고 문서가 설명합니다. 대상이 빠르고 결정적일수록 좋다고 권하며(입력 하나가 수십 밀리초보다 훨씬 짧은 대상이 잘 맞는다고 함), 잘못된 입력에 assert로 죽거나 전역 상태가 큰 대상에는 맞지 않는다고 합니다. 문서는 원래 개발자들이 Centipede로 옮겼고 libFuzzer는 중요한 버그만 고친다고도 적고 있습니다.

### Jackalope

- 정체: Google Project Zero가 만든, 블랙박스 바이너리용 커버리지 기반 퍼저입니다. 공식 Google 제품은 아니라고 README가 밝힙니다.
- 동작: 기본적으로 TinyInst로 바이너리를 실행 중에 계측해서 소스 없이도 커버리지를 얻습니다. 새 커버리지를 연 샘플을 코퍼스에 남기고, 크래시는 재현되는지 다시 시도해 확인합니다. 대상 함수를 반복 호출하는 persistent 방식(`-persist`, `-loop`)과 여러 스레드, 여러 기계로 확장하는 기능도 있습니다.
- 대상: Windows, macOS, Linux, Android에서 소스 없이 퍼징할 수 있다고 README가 설명합니다. 소스가 필요한 경우는 Linux의 SanitizerCoverage 모드뿐입니다.
- 장점: 소스가 없는 프로그램, 특히 Windows·macOS의 닫힌 소프트웨어에 쓸 수 있습니다.
- 단점: README는 이진 형식용 기본 mutator 모음과 문법 기반 mutation 엔진을 함께 제공하지만 고급 변형 전략은 아직 없다고 밝히고, 기본 mutator는 많은 대상에 통하더라도 대상에 맞는 mutator를 직접 작성하라고 권합니다. 메모리 오류 감지는 OS가 제공하는 특수 할당기(Windows Page Heap 등)를 쓰라고 안내하고(macOS Guard Malloc 지원은 TinyInst에서 실험적이라고 함), C++ 예외 처리가 있으면 계측 중 오류나 멈춤이 생길 수 있다고 밝힙니다. macOS에서는 디버깅 권한이 필요합니다.

## 5. 비교 표

| 비교 항목 | AFL++ | libFuzzer | Jackalope |
|---|---|---|---|
| 대상 OS (문서 기준) | 계측 방식에 따라 다름. 제가 쓴 환경은 Linux, 문서상 Frida 모드는 macOS도 지원 | LLVM 문서: macOS와 Linux에서는 LLVM과 함께 기본 빌드, 다른 OS는 빌드 옵션으로 요청 가능, FAQ는 Windows도 지원하되 ASan 없이 쓰는 것 등은 미지원이라고 함 | Windows, macOS, Linux, Android |
| 소스 필요 여부 | 소스 계측은 필요, QEMU·Frida 모드는 소스 없이 가능 | 하네스를 작성해 링크해야 하고, 커버리지는 SanitizerCoverage로 계측해 컴파일한 코드에서만 얻음 | 블랙박스는 불필요, sancov 모드(Linux)만 필요 |
| 계측 방식 | 컴파일 시 계측(afl-cc), 또는 QEMU·Frida로 실행 중 계측 | 컴파일 시 SanitizerCoverage | 실행 중 계측(TinyInst) |
| 실행 방식 | `afl-fuzz`가 별도 프로세스로 실행(fork 서버), persistent 모드 가능 | in-process, 같은 프로세스에서 함수 반복 호출 | 별도 프로세스, persistent 반복도 가능 |
| 입력을 넣는 길 | 파일, stdin, persistent 시 공유 메모리 버퍼 | `LLVMFuzzerTestOneInput` 함수 인자 | 파일 또는 공유 메모리 |
| 잘 맞는 상황 | 소스가 있는 프로그램 전체를 입력 파일로 돌릴 때, 바이너리 전용 모드를 고를 때 | 라이브러리나 파서 함수를 빠르게 때릴 때 | 소스 없는 프로그램, 특히 Windows·macOS |
| 조심할 점 | 컴파일러 지원이 없으면 계측이 막힘 | 대상이 빠르고 결정적이어야 함, 신규 기능 개발은 중단 쪽 | 메모리 오류 감지는 OS 도구 권장, 대상에 맞는 mutator는 직접 작성 권장 |

세 도구는 서로 경쟁한다기보다 상황에 따라 갈립니다. 소스가 있으면 AFL++나 libFuzzer, 없으면 AFL++의 QEMU·Frida 모드나 Jackalope, 이런 식입니다. 그리고 이 표의 내용은 문서를 읽고 정리한 것이어서 성능 순위를 말하지 않습니다. 같은 대상에서 직접 비교해 본 것이 아니기 때문입니다.

## 6. 직접 돌려보기 — AFL++로 크래시 찾기

여기부터는 직접 실행한 결과입니다. 재현에 쓴 파일과 로그는 서버의 `tools/fuzzing-lab/` 아래에 있습니다. libFuzzer와 Jackalope는 이번에 직접 돌려 보지 않았습니다. 서버에 clang이 없고, Jackalope도 직접 실행하지 않았으므로, 4장의 두 도구 설명은 문서를 읽은 내용입니다.

### 6-1. 설치

```text
$ git clone --depth 1 https://github.com/AFLplusplus/AFLplusplus
Cloning into 'AFLplusplus'...
$ git log -1 --format="%h %cd"
d798677 Sun Nov 15 11:42:40 2026 +0100
```

소스에서 빌드했습니다. 서버의 도구 버전은 아래와 같고 clang은 없습니다. 관리자 권한과 패키지 설치는 쓰지 않았습니다.

```text
$ gcc --version | head -1
gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0
$ make --version | head -1
GNU Make 4.3
$ which clang
exit=1
```

```text
$ make source-only -j4
...
GNUmakefile.llvm:82: [!] llvm_mode needs llvm-config, which was not found. Set LLVM_CONFIG to its path and retry.
...
GNUmakefile.llvm:148: we have trouble finding clang - llvm-config is not helping us
GNUmakefile.llvm:163: we have trouble finding clang++ - llvm-config is not helping us
...
[*] Building 32-bit variant of the runtime (-m32)... failed (that's fine)
...
[*] Building 64-bit variant of the runtime (-m64)... success!
...
[-] Oops, can't find gcc header files. Be sure to install 'gcc-X-plugin-dev'.
make[1]: *** [GNUmakefile.gcc_plugin:142: test_deps] Error 1
...
[-] PROGRAM ABORT : no compiler mode available
         Location : mode_final_checkout(), src/afl-cc.c:1183

Oops, afl-cc failed
make: *** [GNUmakefile:733: test_build] Error 1

real	0m22.166s
```

위 출력은 로그에서 핵심 줄만 뽑고 줄임표로 생략한 것입니다. 정리하면 이렇습니다.

- 퍼저 본체 `afl-fuzz`와 런타임(`afl-compiler-rt.o`)은 22초 만에 만들어졌습니다.
- 대상을 계측하는 컴파일러 래퍼 `afl-cc`는 쓸 수 있는 모드가 없다고 중단됩니다. 서버에 clang(LLVM 모드)도, gcc 플러그인 개발 헤더(GCC 플러그인 모드)도 없기 때문입니다. 마지막 `make` 오류는 이 마지막 점검 단계에서 난 것입니다.

```text
$ ls afl-fuzz afl-cc
-rwxrwxr-x 1 [가림] [가림]  275032 Nov 24 04:27 afl-cc
-rwxrwxr-x 1 [가림] [가림] 2280816 Nov 24 04:27 afl-fuzz
$ afl-fuzz -h (첫 줄)
afl-fuzz++5.04a

$ afl-cc --version

[-] PROGRAM ABORT : no compiler mode available
         Location : mode_final_checkout(), src/afl-cc.c:1183
```

퍼저는 버전 `++5.04a`로 실행되지만 `afl-cc`는 동작하지 않는다는 점이 확인됩니다.

### 6-2. 우회: gcc의 계측 기능으로 대신하기

`afl-cc`를 쓸 수 없어서, gcc 자체의 `-fsanitize-coverage=trace-pc` 옵션을 썼습니다. 이 옵션은 코드의 각 구간에서 함수 `__sanitizer_cov_trace_pc`를 부르도록 컴파일합니다. 이 함수를 짧게 직접 써서 AFL++의 공유 메모리 지도에 기록하게 연결했고, 포크 서버 같은 나머지는 AFL++의 `afl-compiler-rt.o`가 맡습니다.

```c
/* shim.c(발췌) — gcc 계측 호출을 AFL++ 공유 메모리 지도에 기록하는 작은 어댑터 */
extern uint8_t *__afl_area_ptr;
static __thread uint32_t prev;
void __sanitizer_cov_trace_pc(void) {
    uint32_t cur = ((uintptr_t)__builtin_return_address(0) >> 1) & 0xFFFF;
    __afl_area_ptr[cur ^ prev]++;
    prev = cur >> 1;
}
```

이 조합은 AFL++ 공식 문서에서 지원한다고 확인한 방식이 아닙니다. 실제로 포크 서버가 올라오고 커버리지가 쌓이는 것을 로그로 확인한 실험용 우회입니다(공식 경로는 clang이나 gcc 플러그인 헤더가 있는 환경). 어댑터에는 코어 덤프를 끄는 줄(`prctl(PR_SET_DUMPABLE, 0)`)도 더했습니다. 이 서버는 `cat /proc/sys/kernel/core_pattern` 값이 `|/usr/share/apport/apport -p%p ...` 로 시작해(logs/12-core-pattern.log) 코어 덤프를 외부 프로그램(apport)에 넘기게 되어 있고, AFL++도 이 설정이 크래시 통보를 늦춰 시간 초과로 오해하게 만들 수 있다고 경고합니다. 직접 크래시 입력 하나를 넣어 시간을 재 보니 코어 덤프가 켜진 빌드는 `real 0m1.113s`, 꺼진 빌드는 `real 0m0.001s`였습니다(logs/10-crash-delay.log). 그래서 그 지연이 원인으로 보이지만, 지연 원인을 apport 내부까지 확인한 것은 아닙니다. 아래 6-4의 퍼징 로그에도 이 경고가 그대로 찍혀 있습니다.

### 6-3. 일부러 버그를 넣은 대상

```c
static void parse(const unsigned char *buf, size_t n) {
    char name[16];
    if (n < 5) return;
    if (buf[0] != 'F') return;
    if (buf[1] != 'U') return;
    if (buf[2] != 'Z') return;
    if (buf[3] != 'Z') return;
    size_t len = buf[4];
    memcpy(name, buf + 5, len);   /* BUG: len 이 16 을 넘어도 검사하지 않는다 */
    name[len < 15 ? len : 15] = 0;
    printf("name=%s\n", name);
}
```

입력이 `FUZZ`로 시작하고, 다섯 번째 바이트(길이)가 16보다 크면(`len >= 17`) 16바이트 상자가 넘칩니다. 코드에는 결함이 하나 더 있습니다. 입력 길이 `n`이 5 이상인지만 확인하고, 복사할 `len`바이트가 실제 입력 안에 들어 있는지(`n >= 5 + len`)는 확인하지 않습니다. `main`의 256바이트 버퍼를 0으로 초기화해 두었기 때문에, 입력이 짧아도 버퍼 뒤쪽의 0이 복사되어 같은 넘침이 일어납니다. 복사는 `buf + 5`부터 `len`바이트라서 `len`이 251을 넘으면 `buf` 배열 끝(256바이트)을 넘어 읽는 out-of-bounds read도 생깁니다(`len`은 최대 255이므로 최대 4바이트, logs/13-oob-calc.log). 이번에 저장된 재현 입력의 `len`은 90이라 이 경우가 아닙니다. 코드는 일부러 이렇게 두었습니다. 직접 넣어 본 결과입니다.

```text
$ gcc -O1 -g target.c -o target_plain
$ printf "FUZZ\x03abc" | ./target_plain
name=abc
$ printf "FUZZ\x40" | ./target_plain
*** buffer overflow detected ***: terminated
/bin/bash: line 87: 1809081 Done                    printf 'FUZZ\x40'
     1809082 Aborted                 (core dumped) | ./target_plain
exit=134
```

정상 입력은 `name=abc`를 출력하고, 길이가 큰 입력은 종료 코드 134(SIGABRT)로 죽습니다. 이 서버의 gcc는 `-O1`에서 `_FORTIFY_SOURCE`가 3으로 기본 정의되고 `-O0`에서는 정의되지 않는 것을 확인했고(logs/11-fortify.log, 이 글의 빌드는 `-O1`), `*** buffer overflow detected ***` 메시지로 보아 `memcpy` 크기 검사가 넘침을 잡은 것으로 보입니다. 그래서 새니타이저를 따로 붙이지 않아도 크래시로 드러났습니다. ASan은 이번에 쓰지 않았습니다. 실제 프로젝트에서는 ASan 같은 새니타이저를 붙이는 쪽이 일반적입니다.

계측 빌드와 실행 준비입니다.

```text
$ gcc -O1 -g -fno-pie -c shim.c -o shim.o
$ gcc -O1 -g -fno-pie -no-pie -fsanitize-coverage=trace-pc target.c shim.o ../AFLplusplus/afl-compiler-rt.o -o target_cov
exit=0
```

### 6-4. 퍼징 실행 (coverage-guided)

씨앗은 `AAAAAAAA` 한 개뿐입니다. 정답에 가까운 힌트는 주지 않았습니다.

```text
$ afl-fuzz -i in -o out -V 300 -- ./target_cov
[+] Enabled environment variable AFL_SKIP_CPUFREQ with value 1
[+] Enabled environment variable AFL_I_DONT_CARE_ABOUT_MISSING_CRASHES with value 1
[+] Enabled environment variable AFL_NO_UI with value 1
[*] Spinning up the fork server...
[+] All right - new fork server model v1 is up.
[*] Target map size: 65536
afl-fuzz++5.04a
...
[*] Checking core_pattern...
...
[-] Your system is configured to send core dump notifications to an
    external utility. This will cause issues: there will be an extended delay
    between stumbling upon a crash and having this information relayed to the
    fuzzer via the standard waitpid() API.
...
[+] Loaded a total of 1 seeds.
[+] Coverage target: ./target_cov
...
[*] Attempting dry run with 'id:000000,time:0,execs:0,orig:seed'...
    len = 8, map size = 3, exec speed = 250 us, hash = 5a5f49f1d40e1d5b
...
[*] No -t option specified, so I'll use an exec timeout of 20 ms.
[+] All set and ready to roll!
...
+++ Testing aborted programmatically +++
[!] Time limit was reached
[*] Statistics: 5 new corpus items found, 0.02% coverage achieved, 1 crashes saved, 0 timeouts saved, total runtime 0 days, 0 hrs, 5 min, 0 sec
```

환경 변수 중 `AFL_I_DONT_CARE_ABOUT_MISSING_CRASHES=1`은 위 core_pattern 경고를 알고도 진행한다는 뜻입니다. `-V 300`은 300초 뒤에 스스로 멈추라는 옵션입니다. 처음에는 코어 덤프를 끄지 않았더니 크래시 대신 시간 초과(hang)가 저장되었습니다. 관찰한 것은 세 가지입니다. AFL++가 core_pattern 경고를 출력했고, 크래시 하나를 직접 실행하면 코어 덤프가 켜진 쪽이 1.113초 걸렸으며, 코어 덤프를 끈 실행에서는 크래시가 정상 기록되었습니다. 이 셋으로 보아 원인은 위에 쓴 apport 지연으로 추정합니다. 코어 덤프를 끈 뒤 다시 돌린 것이 위의 로그입니다. 그 처음 상태를 60초만 다시 재현해 보니 다음과 같았습니다.

```text
$ afl-fuzz -i in -o out_dump -V 60 -- ./target_cov_dump
[!] Time limit was reached
[*] Statistics: 5 new corpus items found, 0.02% coverage achieved, 0 crashes saved, 1 timeouts saved, total runtime 0 days, 0 hrs, 1 min, 0 sec
$ ls out_dump/default/crashes out_dump/default/hangs
out_dump/default/crashes:

out_dump/default/hangs:
id:000000,src:000004,time:1678,execs:4056,op:havoc,rep:1
```

크래시 0개, 시간 초과(hang) 1개입니다. 저장된 hang 입력을 코어 덤프가 켜진 빌드로 다시 실행해 보면 크래시로 끝납니다.

```text
$ time ./target_cov_dump < (hang 입력)   # 코어 덤프 켜진 빌드, 1회
*** buffer overflow detected ***: terminated
/bin/bash: line 1: 71685 Aborted                 (core dumped) ./target_cov_dump < $H

real	0m1.121s
user	0m0.000s
sys	0m0.001s
exit=134
```

종료 코드 134(SIGABRT)이고 1.121초가 걸렸습니다. 크래시 입력이 늦게 통보되어 시간 초과로 처리된 것으로 보입니다.

결과 통계와 저장된 크래시 입력입니다.

```text
$ cat out/default/fuzzer_stats (발췌)
start_time        : 1795494639
run_time          : 300
execs_done        : 1873525
execs_per_sec     : 6245.02
corpus_count      : 6
saved_crashes     : 1
last_crash        : 1795494640
edges_found       : 12
afl_version       : ++5.04a
$ ls out/default/crashes
README.txt
id:000000,sig:06,src:000003,time:1600,execs:9737,op:havoc,rep:8
$ xxd out/default/crashes/id*
00000000: 4655 5a5a 5a5a 5a5a 5a5a 5a5a 5a5a 5a5a  FUZZZZZZZZZZZZZZ
00000010: 5a5a 5a5a 5a5a 5a6b 5a5a 5a5a 5a5a 5a5a  ZZZZZZZkZZZZZZZZ
00000020: 5a5a 5a5a 5a41 2097 b7                   ZZZZZA ..
$ ./target_cov < out/default/crashes/id*
*** buffer overflow detected ***: terminated
/bin/bash: line 1: 4070124 Aborted                 ./target_cov < out/default/crashes/id* 2>&1
exit=134
```

읽는 법입니다.

- 크래시 파일 이름의 `sig:06`은 SIGABRT, `time:1600`은 시작한 지 1600밀리초(1.6초), `execs:9737`은 그때까지 9,737번 실행했다는 뜻입니다. 이 설명은 AFL++ 파일 이름 규칙을 로그 값과 맞춰 본 것입니다.
- 크래시 입력은 `FUZZ`로 시작하고 5번째 바이트가 `Z`(0x5a=90)라서 길이 90바이트를 16칸 상자에 복사하려다 죽습니다. 저장된 입력을 다시 넣으면 같은 크래시가 재현됩니다(종료 코드 134).
- 300초 동안 실행 횟수는 1,873,525번, 초당 약 6,245번이었습니다(`execs_per_sec`는 로그 값). 크래시는 처음 1.6초에 나왔고, 나머지 시간에도 AFL++가 고유 크래시로 저장한 것은 더 늘지 않았습니다(`saved_crashes`가 1). `execs_per_sec`는 AFL++가 `fuzzer_stats`에 기록한 값을 그대로 옮긴 것이라, 실행 횟수를 표시된 초(정수)로 나눈 값과 조금 다를 수 있습니다.

퍼저가 한 글자씩 풀어 간 흔적은 코퍼스에 남아 있습니다.

```text
$ ls out/default/queue
id:000000,time:0,execs:0,orig:seed
id:000001,src:000000,time:0,execs:5,op:trim,rep:0,+cov
id:000002,src:000001,time:108,execs:643,op:havoc,rep:8,+cov
id:000003,src:000002,time:318,execs:1921,op:havoc,rep:6,+cov
id:000004,src:000003,time:1582,execs:9626,op:havoc,rep:10,+cov
id:000005,src:000004,time:10264,execs:63058,op:havoc,rep:2,+cov
...
$ xxd id:000002,src:000001,time:108,execs:643,op:havoc,rep:8,+cov | head -1
00000000: 4648 4101 40                             FHA.@
$ xxd id:000003,src:000002,time:318,execs:1921,op:havoc,rep:6,+cov | head -1
00000000: 4655 4141 41b7                           FUAAA.
$ xxd id:000004,src:000003,time:1582,execs:9626,op:havoc,rep:10,+cov | head -1
00000000: 4655 5a41 4149 4141                      FUZAAIAA
$ xxd id:000005,src:000004,time:10264,execs:63058,op:havoc,rep:2,+cov | head -1
00000000: 4655 5a5a 1041 4941                      FUZZ.AIA
```

위 출력을 보면 코퍼스에 들어간 입력의 앞부분이 `F`(108ms), `FU`(318ms), `FUZ`(1582ms), `FUZZ`(10264ms)로 한 글자씩 늘어납니다(관찰한 것은 이 순서와 시각까지입니다). 각 입력이 저장된 이유는 새 비교 분기를 통과해 새 커버리지가 생겼기 때문으로 보이지만, 내부 판정을 직접 확인한 것은 아니라 추정입니다. `F`를 맞힌 입력이 새 길을 열었다고 판정되어 코퍼스에 남았고, 그것이 다음 변형의 재료가 된 것으로 보입니다(이것도 추정). 크래시 파일 이름의 `src:000003`은 부모가 3번 입력(`FU...`)이라는 뜻입니다. 크래시는 그 입력을 변형하던 중 1.6초에 나왔고, 4번 입력(`FUZ...`)이 코퍼스에 들어간 시각(1582ms)과 거의 같습니다. `FUZZ`로 시작하는 5번 입력(10.264초)은 크래시(1.6초)보다 나중에 저장된 것이라 크래시의 직접 부모가 아닙니다.

### 6-5. 비교 실험 — 피드백 없이 돌리면?

같은 대상을 계측하지 않고(`target_dumb`), AFL++의 맹목 모드(`-n`)로 2분 돌렸습니다. 씨앗은 같지만 계측 여부와 실행 속도도 함께 달라서(초당 실행 횟수가 약 6,245회와 약 1,771회로 다릅니다. 두 값은 AFL++가 기록한 값을 그대로 옮긴 것이라 실행 횟수÷초 계산과 조금 다를 수 있습니다) 피드백만 바꾼 통제된 비교는 아닙니다.

```text
$ afl-fuzz -n -i in -o out_dumb -V 120 -- ./target_dumb
...
[*] Statistics: 0 new corpus items found, 0.00% coverage achieved, 0 crashes saved, 0 timeouts saved, total runtime 0 days, 0 hrs, 2 min, 0 sec
...
$ tail -1 out_dumb/plot_data
120, 725, 0, 1, 0, 0, 0.00%, 0, 0, 1, 1771.34, 212994, 0, 0, 0
```

`plot_data`의 열 이름은 같은 파일 첫 줄(`relative_time, cycles_done, ..., saved_crashes, saved_hangs, max_depth, execs_per_sec, total_execs, ...`)을 기준으로 읽었습니다. 120초 동안 212,994번 실행했고 크래시도 시간 초과도 0개였습니다.

| 실험 | 실행 시간 | 총 실행 횟수 | 크래시 |
|---|---|---|---|
| coverage-guided (계측 O) | 크래시까지 1.6초 (전체 300초) | 크래시까지 9,737번 (전체 1,873,525번) | 1개 |
| 피드백 없음 (`-n`, 계측 X) | 120초 | 212,994번 | 0개 |

해석할 때 조심할 점입니다. 두 쪽은 각각 한 번씩만 돌린 결과입니다. 맹목 쪽이 영원히 못 찾는다는 증거는 아니고, 실행 횟수도 같지 않습니다. 다만 한쪽은 9,737번 실행 만에 1.6초에 찾았고, 다른 쪽은 그보다 20배 넘게(212,994번) 실행하고도 못 찾았다는 점은 3장 ③에서 설명한 피드백의 효과와 방향이 맞습니다. 그래서 차이를 더 확실히 말하려면 같은 실험을 여러 번 반복해야 합니다.

## 7. 배운 점과 앞으로 할 것

배운 점입니다.

- 피드백 없이 변형만 하는 blind 퍼징도 퍼징이지만, 이 실험에서는 피드백이 있는 쪽이 1.6초에 찾았고 blind 쪽은 120초 안에 찾지 못했습니다. 못 찾았다는 관측일 뿐이라 정확한 배율은 모르고, 한 번씩의 실험이라는 한계도 있습니다.
- 설치가 퍼징의 절반이었습니다. 퍼저 본체는 22초 만에 빌드됐지만 계측 컴파일러가 없어서 실제로 대상을 계측하는 데는 우회가 필요했습니다. 퍼저 선택은 대상 소스와 컴파일러 환경에서 먼저 좁혀진다는 것을 알았습니다.
- 크래시가 났다는 사실을 퍼저가 알아채는 환경 조건(여기서는 코어 덤프 설정)이 있다는 것도 처음 알았습니다.

앞으로 할 것입니다.

- clang이 있는 환경(또는 gcc 플러그인 헤더가 있는 환경)에서 `afl-cc`로 같은 대상을 다시 계측해 보고, 이번 우회와 결과가 어떻게 다른지 비교하기.
- libFuzzer로 같은 대상을 `LLVMFuzzerTestOneInput` 형태로 다시 짜서 돌려 보고, AFL++와 크래시까지 걸리는 시간을 비교하기. 지금은 직접 해 보지 않아 5장의 비교가 문서 기준입니다.
- 소스가 없는 대상을 위해 AFL++의 QEMU 모드나 Jackalope를 실제로 돌려 보기.
- 제가 만들고 있는 QEMU 탐지 도구와 연결하기: 퍼저로 QEMU의 장치 에뮬레이션 코드를 압박하면, 탐지 도구가 이상 행위를 얼마나 잘 잡는지 시험할 재료를 만들 수 있을지 생각해 보는 단계입니다. 아직 시도한 것은 없고, 버그바운티에 쓰려면 프로그램이 허용한 범위 안에서만 해야 합니다.

## 참고

모두 직접 열어 읽은 문서입니다.

- 미션 안내: [AFLplusplus/AFLplusplus](https://github.com/AFLplusplus/AFLplusplus) (README)
- 미션 안내: [googleprojectzero/Jackalope](https://github.com/googleprojectzero/Jackalope) (README)
- 미션 안내: [google/fuzzing](https://github.com/google/fuzzing/tree/master) (저장소 구성)
- Google fuzzing, [glossary.md](https://github.com/google/fuzzing/blob/master/docs/glossary.md) (용어집)
- AFL++, [Fuzzing binary-only targets](https://github.com/AFLplusplus/AFLplusplus/blob/stable/docs/fuzzing_binary-only_targets.md)
- AFL++, [Persistent mode](https://github.com/AFLplusplus/AFLplusplus/blob/stable/instrumentation/README.persistent_mode.md)
- LLVM, [libFuzzer – a library for coverage-guided fuzz testing](https://llvm.org/docs/LibFuzzer.html)
