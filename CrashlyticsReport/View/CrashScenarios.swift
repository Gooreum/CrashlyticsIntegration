//
//  CrashScenarios.swift
//  CrashlyticsReport
//
//  Created by Crashlytics AI Bot on 2/15/26.
//

import SwiftUI
import Foundation
import FirebaseCrashlytics

// MARK: - SwiftUI 뷰

struct CrashScenarios: View {
    @State private var result: String = "버튼을 눌러 크래시를 발생시키세요"
    @State private var isLoading = false
    
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text("💥 복잡한 크래시 시나리오")
                    .font(.headline)
                
                Text(result)
                    .font(.caption)
                    .foregroundColor(.gray)
                    .padding(.bottom, 8)
                
                // ==============================
                // 기존 10개 시나리오 (1~10)
                // ==============================
                
                Group {
                    Button("1. 로그인 전 사용자 접근") {
                        let name = UserService.shared.getCurrentUserName()
                        result = "사용자: \(name)"
                    }
                    
                    Button("2. 친구 이메일 조회 (중첩 옵셔널)") {
                        let email = UserService.shared.getFirstFriendEmail()
                        result = "이메일: \(email)"
                    }
                    
                    Button("3. 캐시 미스 유저 조회") {
                        let user = UserService.shared.getCachedUser(id: "nonexistent-id")
                        result = "유저: \(user.name)"
                    }
                    
                    Button("4. 빈 카트 평균 가격") {
                        let avg = CartService.shared.getAveragePrice()
                        result = "평균: \(avg)"
                    }
                    
                    Button("5. 할인 상품 없을 때 조회") {
                        let item = CartService.shared.getMostDiscountedItem()
                        result = "상품: \(item.name)"
                    }
                }
                
                Group {
                    Button("6. 잘못된 결제 수단 타입") {
                        CartService.shared.processPayment(method: 12345)
                    }
                    
                    Button("7. 동시 주문 배열 접근") {
                        isLoading = true
                        for _ in 0..<100 {
                            OrderService.shared.fetchOrdersAsync { orders in
                                DispatchQueue.main.async {
                                    result = "주문 수: \(orders.count)"
                                    isLoading = false
                                }
                            }
                        }
                    }
                    
                    Button("8. 존재하지 않는 주문 조회") {
                        let label = OrderService.shared.getOrderShippingLabel(orderId: "fake-order")
                        result = "배송: \(label)"
                    }
                    
                    Button("9. 특수문자 URL 요청") {
                        NetworkManager.shared.fetchData(from: "https://api.example.com/검색?q=크래시 테스트&page=1")
                    }
                    
                    Button("10. 잘못된 JSON 파싱") {
                        let badJson = """
                        {"user_id": "abc", "balance": null}
                        """.data(using: .utf8)!
                        let _ = NetworkManager.shared.parseResponse(data: badJson)
                    }
                }
                
                Divider().padding(.vertical, 8)
                
                Text("💥 추가 크래시 시나리오 (11~30)")
                    .font(.headline)
                
                // ==============================
                // 추가 20개 시나리오 (11~30)
                // ==============================
                
                Group {
                    Button("11. 빈 채팅방 마지막 메시지") {
                        let msg = ChatService.shared.getLastMessage()
                        result = "메시지: \(msg.text ?? "없음")"
                    }
                    
                    Button("12. 짧은 메시지 50자 자르기") {
                        let preview = ChatService.shared.getMessagePreview(messageId: "msg-1")
                        result = "미리보기: \(preview)"
                    }
                    
                    Button("13. 빈 타이핑 목록에서 삭제") {
                        ChatService.shared.removeTypingUser(at: 5)
                        result = "삭제 완료"
                    }
                    
                    Button("14. 잘못된 정규식 패턴") {
                        let results = SearchService.shared.searchWithRegex(
                            pattern: "[invalid(regex",
                            in: "sample text"
                        )
                        result = "결과: \(results.count)건"
                    }
                    
                    Button("15. 없는 검색 결과 접근") {
                        let product = SearchService.shared.getTopSearchResult(query: "없는검색어")
                        result = "상품: \(product.name)"
                    }
                }
                
                Group {
                    Button("16. 검색 페이지네이션 범위 초과") {
                        let page = SearchService.shared.getSearchPage(
                            query: "test", page: 999, pageSize: 20
                        )
                        result = "결과: \(page.count)건"
                    }
                    
                    Button("17. nil 딥링크 알림 처리") {
                        let notification = Notification(
                            id: "1", type: "promo",
                            payload: nil, deepLink: nil
                        )
                        NotificationService.shared.handleNotification(notification)
                    }
                    
                    Button("18. 알림 payload 타입 오류") {
                        let notification = Notification(
                            id: "2", type: "alert",
                            payload: ["title": 123, "count": "many"],
                            deepLink: nil
                        )
                        let title = NotificationService.shared.getNotificationTitle(notification)
                        result = "알림: \(title)"
                    }
                    
                    Button("19. 뱃지 카운트 오버플로우") {
                        let count = NotificationService.shared.incrementBadge(for: "messages")
                        result = "뱃지: \(count)"
                    }
                    
                    Button("20. 빈 재생목록 셔플") {
                        let track = MediaService.shared.getShuffledTrack()
                        result = "트랙: \(track.url)"
                    }
                }
                
                Group {
                    Button("21. 첫 번째 트랙에서 이전 트랙") {
                        let prev = MediaService.shared.getPreviousTrack(currentIndex: 0)
                        result = "이전 트랙: \(prev.url)"
                    }
                    
                    Button("22. 재생 진행률 소수점 변환") {
                        let progress = MediaService.shared.getTrackProgress(
                            current: 73.7, total: 180.0
                        )
                        result = "진행률: \(progress)%"
                    }
                    
                    Button("23. 설정값 타입 불일치") {
                        let enabled = ProfileService.shared.getNotificationPreference()
                        result = "알림: \(enabled)"
                    }
                    
                    Button("24. 빈 언어 목록 첫 번째") {
                        let lang = ProfileService.shared.getPrimaryLanguage()
                        result = "언어: \(lang)"
                    }
                    
                    Button("25. 나이 문자열 변환 실패") {
                        let age = ProfileService.shared.getUserAge()
                        result = "나이: \(age)"
                    }
                }
                
                Group {
                    Button("26. 캐시 미스 이미지 조회") {
                        let image = CacheManager.shared.getCachedImage(key: "nonexistent-key")
                        result = "이미지: \(image.size)"
                    }
                    
                    Button("27. 존재하지 않는 캐시 파일") {
                        let size = CacheManager.shared.getCacheFileSize(at: 0)
                        result = "파일 크기: \(size)"
                    }
                    
                    Button("28. 잘못된 날짜 형식 파싱") {
                        let date = DateFormatterService.shared.parseServerDate(
                            dateString: "2026/02/17 12:00"
                        )
                        result = "날짜: \(date)"
                    }
                    
                    Button("29. 잘못된 날짜 간격 계산") {
                        let days = DateFormatterService.shared.getDaysBetween(
                            start: "not-a-date",
                            end: "also-not-a-date"
                        )
                        result = "일수: \(days)"
                    }
                    
                    Button("30. Codable 인코딩 실패") {
                        struct TestModel: Codable { let value: Double }
                        let model = TestModel(value: .infinity)
                        let copy = DeepCopyService.shared.deepCopy(object: model)
                        result = "복사: \(copy.value)"
                    }
                }
            }
            .padding()
        }
    }
}

#Preview {
    CrashScenarios()
}
