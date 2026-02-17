//
//  DeepCopyService.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/17/26.
//

import Foundation

class DeepCopyService {
    static let shared = DeepCopyService()
    
    /// 크래시 30: JSONEncoder/Decoder 체이닝 — Codable 미준수 타입
    func deepCopy<T: Codable>(object: T) -> T {
        let data = try! JSONEncoder().encode(object)
        return try! JSONDecoder().decode(T.self, from: data)
    }
}

