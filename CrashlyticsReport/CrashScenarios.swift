//
//  CrashScenarios.swift
//  CrashlyticsReport
//
//  Created by Crashlytics AI Bot on 2/15/26.
//

import SwiftUI
import Foundation
import FirebaseCrashlytics

// MARK: - 모델 정의

struct User {
    let id: String
    let name: String
    let email: String?
    let profileImageURL: String?
    let friends: [User]?
}

struct Product {
    let id: String
    let name: String
    let price: Double
    let discountRate: Double?
    let stock: Int
    let variants: [String]?
}

struct Order {
    let id: String
    let userId: String
    let products: [Product]?
    let totalPrice: Double
    let couponCode: String?
    let shippingAddress: String?
}

struct ChatMessage {
    let id: String
    let senderId: String
    let text: String?
    let imageURL: String?
    let timestamp: Date
    let readBy: [String]?
}

struct Notification {
    let id: String
    let type: String
    let payload: [String: Any]?
    let deepLink: String?
}

struct MediaItem {
    let id: String
    let url: String
    let duration: Double?
    let thumbnail: String?
    let metadata: [String: String]?
}

// MARK: - 크래시 유발 서비스 클래스 (1~10)

class UserService {
    static let shared = UserService()
    private var currentUser: User?
    private var cachedUsers: [String: User] = [:]
    
    /// 크래시 1: Optional 강제 언래핑 — 로그인 전 사용자 접근
    func getCurrentUserName() -> String {
        return currentUser?.name ?? "Unknown User"
    }
    
    /// 크래시 2: 옵셔널 체이닝 없이 중첩 접근
    func getFirstFriendEmail() -> String {
        guard let friends = currentUser?.friends,
              let firstFriend = friends.first,
              let email = firstFriend.email else {
            return "No email available"
        }
        return email
    }
    
    /// 크래시 3: Dictionary 강제 언래핑
    func getCachedUser(id: String) -> User {
        guard let user = cachedUsers[id] else {
            return User(id: "unknown", name: "Unknown", email: nil, profileImageURL: nil, friends: nil)
        }
        return user
    }
}

class CartService {
    static let shared = CartService()
    private var items: [Product] = []
    
    /// 크래시 4: 빈 배열에서 reduce 후 나누기 — Division 관련
    func getAveragePrice() -> Double {
        guard !items.isEmpty else { return 0.0 }
        let total = items.reduce(0.0) { $0 + $1.price }
        return total / Double(items.count)
    }
    
    /// 크래시 5: 범위 초과 접근 — 할인된 상품 필터링 후
    func getMostDiscountedItem() -> Product {
        let discounted = items.filter { $0.discountRate != nil }
        guard let firstItem = discounted.first else {
            return Product(id: "none", name: "No discounted item", price: 0, discountRate: nil, stock: 0, variants: nil)
        }
        return firstItem
    }
    
    /// 크래시 6: 강제 캐스팅
    func processPayment(method: Any) {
        guard let cardNumber = method as? String else {
            print("Invalid payment method type")
            return
        }
        print("Processing payment with card: \(cardNumber)")
    }
}

class OrderService {
    static let shared = OrderService()
    private var orders: [Order] = []
    private let ordersQueue = DispatchQueue(label: "com.app.orders", attributes: .concurrent)
    
    /// 크래시 7: 멀티스레드 — 메인스레드 외에서 배열 동시 접근
    func fetchOrdersAsync(completion: @escaping ([Order]) -> Void) {
        DispatchQueue.global(qos: .background).async { [weak self] in
            guard let self = self else { return }
            
            let newOrder = Order(
                id: UUID().uuidString,
                userId: "test",
                products: nil,
                totalPrice: 0,
                couponCode: nil,
                shippingAddress: nil
            )
            
            self.ordersQueue.async(flags: .barrier) {
                self.orders.append(newOrder)
            }
            
            Thread.sleep(forTimeInterval: 0.01)
            
            self.ordersQueue.async(flags: .barrier) {
                self.orders.removeAll()
            }
            
            self.ordersQueue.sync {
                completion(self.orders)
            }
        }
    }
    
    /// 크래시 8: 옵셔널 체이닝 없이 주문 상세 접근
    func getOrderShippingLabel(orderId: String) -> String {
        guard let order = orders.first(where: { $0.id == orderId }),
              let address = order.shippingAddress,
              let products = order.products,
              let firstProduct = products.first else {
            return "Order not found or incomplete"
        }
        return "\(firstProduct.name) → \(address)"
    }
}

class NetworkManager {
    static let shared = NetworkManager()
    
    /// 크래시 9: 강제 URL 변환 — 특수문자 포함 시
    func fetchData(from urlString: String) {
        guard let encodedString = urlString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: encodedString) else {
            print("Invalid URL: \(urlString)")
            return
        }
        print("Fetching from \(url)")
    }
    
    /// 크래시 10: JSON 디코딩 — 타입 불일치
    func parseResponse(data: Data) -> [String: Any] {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            print("Invalid JSON format")
            return [:]
        }
        
        let userId: Any = json["user_id"] ?? "unknown"
        let balance: Any = json["balance"] ?? 0.0
        
        print("User \(userId), balance: \(balance)")
        return json
    }
}

// MARK: - 추가 크래시 유발 서비스 클래스 (11~30)

class ChatService {
    static let shared = ChatService()
    private var messages: [ChatMessage] = []
    private var typingUsers: [String] = []
    
    /// 크래시 11: 빈 배열 last 강제 언래핑
    func getLastMessage() -> ChatMessage {
        guard let lastMsg = messages.last else {
            return ChatMessage(id: "empty", senderId: "system", text: "No messages", imageURL: nil, timestamp: Date(), readBy: nil)
        }
        return lastMsg
    }
    
    /// 크래시 12: String 인덱싱 범위 초과 — 메시지 미리보기 자르기
    func getMessagePreview(messageId: String) -> String {
        guard let message = messages.first(where: { $0.id == messageId }),
              let text = message.text else {
            return "Message not found"
        }
        
        let maxLength = 50
        if text.count <= maxLength {
            return text
        }
        
        let index = text.index(text.startIndex, offsetBy: maxLength)
        return String(text[..<index])
    }
    
    /// 크래시 13: 배열 removeAt 범위 초과
    func removeTypingUser(at index: Int) {
        guard index >= 0 && index < typingUsers.count else {
            print("Invalid index: \(index)")
            return
        }
        typingUsers.remove(at: index)
    }
}

class SearchService {
    static let shared = SearchService()
    private var recentSearches: [String] = []
    private var searchResults: [String: [Product]] = [:]
    
    /// 크래시 14: 정규식 강제 생성 — 잘못된 패턴
    func searchWithRegex(pattern: String, in text: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            print("Invalid regex pattern: \(pattern)")
            return []
        }
        
        let range = NSRange(text.startIndex..., in: text)
        let matches = regex.matches(in: text, range: range)
        return matches.compactMap { match in
            guard let range = Range(match.range, in: text) else { return nil }
            return String(text[range])
        }
    }
    
    /// 크래시 15: 캐시된 검색결과 강제 언래핑 + 인덱스 접근
    func getTopSearchResult(query: String) -> Product {
        guard let results = searchResults[query],
              let firstResult = results.first else {
            return Product(id: "none", name: "No results", price: 0, discountRate: nil, stock: 0, variants: nil)
        }
        return firstResult
    }
    
    /// 크래시 16: stride 범위 오류 — 페이지네이션
    func getSearchPage(query: String, page: Int, pageSize: Int) -> [Product] {
        let results = searchResults[query] ?? []
        let start = page * pageSize
        let end = min(start + pageSize, results.count)
        
        guard start < results.count else {
            return []
        }
        
        return Array(results[start..<end])
    }
}

class NotificationService {
    static let shared = NotificationService()
    private var notifications: [Notification] = []
    private var badgeCounts: [String: Int] = [:]
    
    /// 크래시 17: 딥링크 URL 강제 언래핑 + 경로 파싱
    func handleNotification(_ notification: Notification) {
        guard let deepLink = notification.deepLink,
              let url = URL(string: deepLink) else {
            print("Invalid deep link")
            return
        }
        
        let pathComponents = url.pathComponents
        guard pathComponents.count > 2 else {
            print("Invalid path components")
            return
        }
        
        let targetId = pathComponents[2]
        print("Navigate to: \(targetId)")
    }
    
    /// 크래시 18: payload 딕셔너리 강제 캐스팅
    func getNotificationTitle(_ notification: Notification) -> String {
        guard let payload = notification.payload,
              let title = payload["title"] as? String else {
            return "No title"
        }
        
        let count = payload["count"] as? Int ?? 0
        return "\(title) (\(count))"
    }
    
    /// 크래시 19: 뱃지 카운트 오버플로우
    func incrementBadge(for category: String) -> Int {
        let current = badgeCounts[category] ?? 0
        let newCount = current < Int.max ? current + 1 : Int.max
        badgeCounts[category] = newCount
        return newCount
    }
}

class MediaService {
    static let shared = MediaService()
    private var playlist: [MediaItem] = []
    private var downloadQueue: [String] = []
    
    /// 크래시 20: 빈 배열 randomElement 강제 언래핑
    func getShuffledTrack() -> MediaItem {
        guard let randomTrack = playlist.randomElement() else {
            return MediaItem(id: "empty", url: "no-track", duration: nil, thumbnail: nil, metadata: nil)
        }
        return randomTrack
    }
    
    /// 크래시 21: 음수 인덱스 계산 오류 — 이전 트랙 이동
    func getPreviousTrack(currentIndex: Int) -> MediaItem {
        let prevIndex = currentIndex - 1
        guard prevIndex >= 0 && prevIndex < playlist.count else {
            return MediaItem(id: "invalid", url: "no-previous-track", duration: nil, thumbnail: nil, metadata: nil)
        }
        return playlist[prevIndex]
    }
    
    /// 크래시 22: Double → Int 변환 시 범위 초과
    func getTrackProgress(current: Double, total: Double) -> Int {
        guard total > 0 else { return 0 }
        let percentage = (current / total) * 100
        return Int(percentage.rounded())
    }
}

class ProfileService {
    static let shared = ProfileService()
    private var settings: [String: Any] = [:]
    private var preferences: [String: [String]] = [:]
    
    /// 크래시 23: UserDefaults 강제 캐스팅 — 타입 변경된 설정값
    func getNotificationPreference() -> Bool {
        guard let value = settings["notification_enabled"] as? Bool else {
            return false
        }
        return value
    }
    
    /// 크래시 24: 빈 배열 first + 강제 언래핑 체이닝
    func getPrimaryLanguage() -> String {
        guard let languages = preferences["languages"],
              let firstLanguage = languages.first else {
            return "en"
        }
        return firstLanguage
    }
    
    /// 크래시 25: String to Int 강제 변환
    func getUserAge() -> Int {
        guard let ageString = settings["age"] as? String,
              let age = Int(ageString) else {
            return 0
        }
        return age
    }
}

class CacheManager {
    static let shared = CacheManager()
    private var memoryCache: NSCache<NSString, AnyObject> = NSCache()
    private var diskPaths: [String] = []
    
    /// 크래시 26: NSCache 강제 캐스팅 — 타입 불일치
    func getCachedImage(key: String) -> UIImage {
        guard let cached = memoryCache.object(forKey: key as NSString) as? UIImage else {
            return UIImage()
        }
        return cached
    }
    
    /// 크래시 27: FileManager 강제 언래핑 — 존재하지 않는 경로
    func getCacheFileSize(at index: Int) -> UInt64 {
        guard index >= 0 && index < diskPaths.count else {
            return 0
        }
        
        let path = diskPaths[index]
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: path),
              let size = attrs[.size] as? UInt64 else {
            return 0
        }
        return size
    }
}

class DateFormatterService {
    static let shared = DateFormatterService()
    
    /// 크래시 28: DateFormatter 강제 언래핑 — 잘못된 날짜 형식
    func parseServerDate(dateString: String) -> Date {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        return formatter.date(from: dateString) ?? Date()
    }
    
    /// 크래시 29: Calendar 계산 강제 언래핑 — 잘못된 컴포넌트
    func getDaysBetween(start: String, end: String) -> Int {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        
        guard let startDate = formatter.date(from: start),
              let endDate = formatter.date(from: end) else {
            return 0
        }
        
        let components = Calendar.current.dateComponents([.day], from: startDate, to: endDate)
        return components.day ?? 0
    }
}

class DeepCopyService {
    static let shared = DeepCopyService()
    
    /// 크래시 30: JSONEncoder/Decoder 체이닝 — Codable 미준수 타입
    func deepCopy<T: Codable>(object: T) -> T {
        guard let data = try? JSONEncoder().encode(object),
              let copy = try? JSONDecoder().decode(T.self, from: data) else {
            return object
        }
        return copy
    }
}

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
