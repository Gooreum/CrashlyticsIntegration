//
//  NetworkManager.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/17/26.
//

import Foundation

class NetworkManager {
    static let shared = NetworkManager()
    
    /// 크래시 9: 강제 URL 변환 — 특수문자 포함 시
    func fetchData(from urlString: String) {
        let url = URL(string: urlString)!  // 잘못된 URL이면 크래시
        print("Fetching from \(url)")
    }
    
    /// 크래시 10: JSON 디코딩 — 타입 불일치
    func parseResponse(data: Data) -> [String: Any] {
        let json = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
        let userId = json["user_id"] as! Int      // String일 수 있음 → 크래시
        let balance = json["balance"] as! Double   // null일 수 있음 → 크래시
        print("User \(userId), balance: \(balance)")
        return json
    }
}
