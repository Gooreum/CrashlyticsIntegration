//
//  CartService.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/17/26.
//

import Foundation

class CartService {
    static let shared = CartService()
    private var items: [Product] = []
    
    /// 크래시 4: 빈 배열에서 reduce 후 나누기 — Division 관련
    func getAveragePrice() -> Double {
        let total = items.reduce(0.0) { $0 + $1.price }
        return total / Double(items.count)  // items가 비어있으면 NaN, Int로 변환 시 크래시 가능
    }
    
    /// 크래시 5: 범위 초과 접근 — 할인된 상품 필터링 후
    func getMostDiscountedItem() -> Product {
        let discounted = items.filter { $0.discountRate != nil }
        return discounted[0]  // 할인 상품이 없으면 크래시
    }
    
    /// 크래시 6: 강제 캐스팅
    func processPayment(method: Any) {
        let cardNumber = method as! String  // method가 String이 아니면 크래시
        print("Processing payment with card: \(cardNumber)")
    }
}
