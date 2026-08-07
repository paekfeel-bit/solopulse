# SoloPulse → Apple App Store (공식 앱)

SoloPulse는 **Capacitor**로 iOS 네이티브 껍데기 + 웹 UI(라이브 서버)를 합친 **하이브리드 앱**으로 앱스토어에 올릴 수 있습니다.  
지금 레포에는 Android 프로젝트가 있고, **iOS는 Mac에서 `cap add ios`로 생성**합니다.

---

## 한 줄 요약

| 단계 | 어디서 | 비용/조건 |
|------|--------|-----------|
| 1. Apple Developer 등록 | appleid + 결제 | **연 $99** |
| 2. iOS 프로젝트 생성 | **Mac + Xcode** | Mac 필수 |
| 3. 아이콘/스플래시 | Mac 또는 디자인 툴 | |
| 4. Archive → App Store Connect | Xcode | |
| 5. 심사 제출 | App Store Connect | 며칠~1주+ |

**Windows PC만으로는 앱스토어 빌드/업로드가 불가능합니다.** (코드 준비는 가능)

---

## 1. Apple Developer Program

1. https://developer.apple.com/programs/ 가입  
2. **Individual** 또는 **Organization** (사업자 있으면 Organization 권장)  
3. 연회비 결제 후 활성화 (몇 시간~1일)

준비물:
- Apple ID
- 신분증/결제 수단
- 앱 이름: **SoloPulse**
- Bundle ID: **`com.solopulse.app`** (이미 `capacitor.config.ts`에 설정됨)

---

## 2. Mac에서 iOS 프로젝트 만들기

```bash
cd solopulse
npm install
npm install @capacitor/ios --save-dev   # 이미 package.json에 있으면 skip

# 라이브 URL 확인 (기본: Cloudflare workers.dev)
# CAP_SERVER_URL=https://solopulse.paekfeel.workers.dev

npx cap add ios
npx cap sync ios
npx cap open ios
```

Xcode가 열리면:
1. **Signing & Capabilities** → Team = 본인 Apple Developer  
2. Bundle Identifier = `com.solopulse.app`  
3. 실제 기기 또는 시뮬레이터에서 Run (▶)

### 필수 도구 (2026)
- **Xcode 26+** (App Store 제출 시 최신 SDK 요구 — [Apple Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/))
- macOS 최신 권장

---

## 3. 앱 아이콘 · 스플래시

권장 크기:
- App Icon: **1024×1024** PNG (투명 없음)
- 스플래시: 다크 배경 `#0c0a09` + 번개/로고

생성 후:

```bash
# 예: @capacitor/assets 사용
npx @capacitor/assets generate --ios
npx cap sync ios
```

또는 Xcode **AppIcon** 슬롯에 직접 넣기.

---

## 4. 개인정보 · App Privacy (심사 필수)

앱스토어 연결 시 설문에 맞게 답변:

| 항목 | SoloPulse 권장 답 |
|------|-------------------|
| 수집 데이터 | 기본적으로 **서버에 계정 없음** — 지갑 주소는 **기기 로컬(localStorage)** |
| 추적 | 광고 추적 없음 → **No** |
| 위치 | 사용 안 함 → **No** |
| 연락처 | 없음 |

App Store Connect → **App Privacy** 작성.

iOS 쪽 Privacy Manifest (`PrivacyInfo.xcprivacy`)는 Capacitor/플러그인 버전에 따라 Xcode 템플릿에 포함됩니다. 제출 전 Xcode에서 확인.

---

## 5. App Store Connect 등록

1. https://appstoreconnect.apple.com  
2. **My Apps → + → New App**  
3. Platform: iOS  
4. Name: SoloPulse  
5. Bundle ID: `com.solopulse.app`  
6. SKU: `solopulse-ios-001`  
7. 스크린샷 (iPhone 6.7" 필수 등 — 시뮬레이터 캡처 가능)  
8. 설명 예시 (한국어):

```
SoloPulse — 솔로 비트코인 채굴 모니터
지갑 주소와 풀만 입력하면 해시레이트·소스 엔진·확률을 실시간으로 확인합니다.
설치 없이 웹과 동일한 풀 기반 모니터링. 집 Wi‑Fi가 아니어도(모바일 데이터) 동작합니다.
```

9. 카테고리: **Finance** 또는 **Utilities**  
10. 연령: 4+ (금융 시세만이면 보통 낮음)

---

## 6. 업로드 (Archive)

Xcode:
1. Product → Destination → **Any iOS Device**  
2. **Product → Archive**  
3. Organizer → **Distribute App → App Store Connect**  
4. Upload  
5. App Store Connect에서 빌드 처리 완료 후 버전 선택 → **Submit for Review**

---

## 7. 심사 통과 팁 (중요)

Apple은 **“그냥 웹사이트만 감싼 앱”**을 거절할 수 있습니다 (Guideline **4.2 Minimum Functionality**).

통과 확률을 높이려면:

1. **앱 전용 스플래시/아이콘/이름** (이미 있음)  
2. **오프라인 안내 화면** — 네트워크 없을 때 “연결 필요” 메시지 (`public/index.html` 폴백)  
3. 설명에 **네이티브 앱 가치** 명시: 홈 화면 아이콘, 풀스크린, 푸시(추후)  
4. 가능하면 나중에:  
   - Push (새 베스트 셰어 알림)  
   - Face ID 로컬 잠금  
   - 홈 화면 위젯  
5. **리뷰 계정/테스트 지갑** 메모를 Review Notes에 적기  
   - 예: 테스트용 공개 솔로 주소 + pool `solo.ckpool.org`

리뷰 노트 예시:

```
SoloPulse is a solo Bitcoin mining monitor.
No login required. Enter any BTC address + pool (default solo.ckpool.org).
Test address: bc1q... (your test wallet)
Primary data: public pool APIs. Works on cellular data.
```

---

## 8. 현재 기술 구조

```
[iPhone 앱 아이콘]
    → Capacitor WKWebView
        → https://solopulse.paekfeel.workers.dev  (라이브 UI)
            → 풀 API 해시/엔진/확률
```

- **장점:** 웹 배포만으로 앱 내용 업데이트 (앱 심사 없이 UI 수정 가능)  
- **단점:** 완전 오프라인 동작 제한, 심사 시 “웹뷰 앱” 지적 가능  

`capacitor.config.ts`의 `server.url` 변경 후:

```bash
npx cap sync ios
```

---

## 9. Windows에서 지금 할 수 있는 것

- [x] `capacitor.config.ts` iOS 설정  
- [x] `@capacitor/ios` 패키지  
- [x] 문서 / 스크립트  
- [ ] `ios/` 폴더 생성 → **Mac 필요**  
- [ ] Archive 업로드 → **Mac + Xcode 필요**  
- [ ] Apple Developer 결제 → **본인 계정**

Mac이 없다면:
- 중고 Mac mini / Mac in cloud (MacStadium, GitHub macOS runner 등)  
- 또는 iOS 빌드만 대행 가능한 개발자에게 `ios` 폴더 생성 의뢰  

---

## 10. 명령 치트시트 (Mac)

```bash
npm install
npx cap add ios          # 최초 1회
npx cap sync ios
npx cap open ios         # Xcode
# Xcode: Signing → Archive → Upload
```

Android (참고):

```bash
npx cap sync android
npx cap open android
```

---

## 다음 액션 (추천 순서)

1. **Apple Developer $99 가입**  
2. **Mac에서 `npx cap add ios` + 실기기 실행**  
3. **1024 아이콘 + 스크린샷 3~5장**  
4. **TestFlight** 내부 테스트  
5. **심사 제출**  

원하시면 다음 단계로:
- 앱 설명/키워드 초안 (한/영)
- Privacy 설문 답안 초안
- 푸시 알림(베스트 쉐어) 설계
를 이어서 작성할 수 있습니다.
