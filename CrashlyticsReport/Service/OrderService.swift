//
//  OrderService.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/17/26.
//

import Foundation

class OrderService {
    static let shared = OrderService()
    private var orders: [Order] = []
    
    /// 크래시 7: 멀티스레드 — 메인스레드 외에서 배열 동시 접근
    func fetchOrdersAsync(completion: @escaping ([Order]) -> Void) {
        DispatchQueue.global(qos: .background).async { [weak self] in
            self?.orders.append(Order(
                id: UUID().uuidString,
                userId: "test",
                products: nil,
                totalPrice: 0,
                couponCode: nil,
                shippingAddress: nil
            ))
            
            DispatchQueue.global().async {
                self?.orders.removeAll()  // 동시 수정 → EXC_BAD_ACCESS
            }
            
            completion(self?.orders ?? [])
        }
    }
    
    /// 크래시 8: 옵셔널 체이닝 없이 주문 상세 접근
    func getOrderShippingLabel(orderId: String) -> String {
        let order = orders.first { $0.id == orderId }
        let address = order!.shippingAddress!  // 주문 없거나 주소 없으면 크래시
        let products = order!.products!        // products가 nil이면 크래시
        let firstProduct = products[0].name
        return "\(firstProduct) → \(address)"
    }
}
