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

// MARK: - 크래시 유발 서비스 클래스

class UserService {
    static let shared = UserService()
    private var currentUser: User?
    private var cachedUsers: [String: User] = [:]
    
    /// 크래시 1: Optional 강제 언래핑 — 로그인 전 사용자 접근
    func getCurrentUserName() -> String {
        guard let user = currentUser else {
            return "로그인되지 않음"
        }
        return user.name
    }
    
    /// 크래시 2: 옵셔널 체이닝 없이 중첩 접근
    func getFirstFriendEmail() -> String {
        guard let user = currentUser,
              let friends = user.friends,
              !friends.isEmpty,
              let email = friends[0].email else {
            return "친구 이메일 없음"
        }
        return email
    }
    
    /// 크래시 3: Dictionary 강제 언래핑
    func getCachedUser(id: String) -> User {
        guard let user = cachedUsers[id] else {
            return User(id: "unknown", name: "캐시 없음", email: nil, profileImageURL: nil, friends: nil)
        }
        return user
    }
}

class CartService {
    static let shared = CartService()
    private var items: [Product] = []
    private let lock = NSLock()
    
    /// 크래시 4: 빈 배열에서 reduce 후 나누기 — Division 관련
    func getAveragePrice() -> Double {
        guard !items.isEmpty else {
            return 0.0
        }
        let total = items.reduce(0.0) { $0 + $1.price }
        return total / Double(items.count)
    }
    
    /// 크래시 5: 범위 초과 접근 — 할인된 상품 필터링 후
    func getMostDiscountedItem() -> Product {
        let discounted = items.filter { $0.discountRate != nil }
        guard let firstItem = discounted.first else {
            return Product(id: "none", name: "할인 상품 없음", price: 0, discountRate: nil, stock: 0, variants: nil)
        }
        return firstItem
    }
    
    /// 크래시 6: 강제 캐스팅
    func processPayment(method: Any) {
        guard let cardNumber = method as? String else {
            print("잘못된 결제 수단 타입")
            return
        }
        print("Processing payment with card: \(cardNumber)")
    }
}

class OrderService {
    static let shared = OrderService()
    private var orders: [Order] = []
    private let queue = DispatchQueue(label: "com.crashlytics.orders", attributes: .concurrent)
    
    /// 크래시 7: 멀티스레드 — 메인스레드 외에서 배열 동시 접근
    func fetchOrdersAsync(completion: @escaping ([Order]) -> Void) {
        DispatchQueue.global(qos: .background).async { [weak self] in
            guard let self = self else { return }
            
            // 백그라운드에서 orders 배열 수정 (스레드 세이프하게)
            self.queue.async(flags: .barrier) {
                self.orders.append(Order(
                    id: UUID().uuidString,
                    userId: "test",
                    products: nil,
                    totalPrice: 0,
                    couponCode: nil,
                    shippingAddress: nil
                ))
            }
            
            // 읽기 작업
            self.queue.async {
                let currentOrders = self.orders
                completion(currentOrders)
            }
        }
    }
    
    /// 크래시 8: 옵셔널 체이닝 없이 주문 상세 접근
    func getOrderShippingLabel(orderId: String) -> String {
        guard let order = orders.first(where: { $0.id == orderId }),
              let address = order.shippingAddress,
              let products = order.products,
              !products.isEmpty else {
            return "주문 정보 없음"
        }
        let firstProduct = products[0].name
        return "\(firstProduct) → \(address)"
    }
}

class NetworkManager {
    static let shared = NetworkManager()
    
    /// 크래시 9: 강제 URL 변환 — 특수문자 포함 시
    func fetchData(from urlString: String) {
        guard let encodedString = urlString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: encodedString) else {
            print("잘못된 URL: \(urlString)")
            return
        }
        print("Fetching from \(url)")
    }
    
    /// 크래시 10: JSON 디코딩 — 타입 불일치
    func parseResponse(data: Data) -> [String: Any] {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            print("JSON 파싱 실패")
            return [:]
        }
        
        // 안전한 타입 변환
        let userId: Any = json["user_id"] ?? "unknown"
        let balance: Any = json["balance"] ?? 0.0
        
        print("User \(userId), balance: \(balance)")
        return json
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
                
                Group {
                    // 크래시 1: Optional 강제 언래핑
                    Button("1. 로그인 전 사용자 접근") {
                        let name = UserService.shared.getCurrentUserName()
                        result = "사용자: \(name)"
                    }
                    
                    // 크래시 2: 중첩 옵셔널 강제 언래핑
                    Button("2. 친구 이메일 조회 (중첩 옵셔널)") {
                        let email = UserService.shared.getFirstFriendEmail()
                        result = "이메일: \(email)"
                    }
                    
                    // 크래시 3: Dictionary 강제 언래핑
                    Button("3. 캐시 미스 유저 조회") {
                        let user = UserService.shared.getCachedUser(id: "nonexistent-id")
                        result = "유저: \(user.name)"
                    }
                    
                    // 크래시 4: 빈 배열 나누기
                    Button("4. 빈 카트 평균 가격") {
                        let avg = CartService.shared.getAveragePrice()
                        result = "평균: \(avg)"
                    }
                    
                    // 크래시 5: 빈 필터 결과 인덱스 접근
                    Button("5. 할인 상품 없을 때 조회") {
                        let item = CartService.shared.getMostDiscountedItem()
                        result = "상품: \(item.name)"
                    }
                }
                
                Group {
                    // 크래시 6: 강제 캐스팅
                    Button("6. 잘못된 결제 수단 타입") {
                        CartService.shared.processPayment(method: 12345)
                    }
                    
                    // 크래시 7: 멀티스레드 레이스 컨디션
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
                    
                    // 크래시 8: 주문 상세 강제 언래핑
                    Button("8. 존재하지 않는 주문 조회") {
                        let label = OrderService.shared.getOrderShippingLabel(orderId: "fake-order")
                        result = "배송: \(label)"
                    }
                    
                    // 크래시 9: 잘못된 URL 강제 변환
                    Button("9. 특수문자 URL 요청") {
                        NetworkManager.shared.fetchData(from: "https://api.example.com/검색?q=크래시 테스트&page=1")
                    }
                    
                    // 크래시 10: JSON 타입 불일치
                    Button("10. 잘못된 JSON 파싱") {
                        let badJson = """
                        {"user_id": "abc", "balance": null}
                        """.data(using: .utf8)!
                        let _ = NetworkManager.shared.parseResponse(data: badJson)
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
