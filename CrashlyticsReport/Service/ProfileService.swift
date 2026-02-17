//
//  ProfileService.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/17/26.
//

import Foundation

class ProfileService {
    static let shared = ProfileService()
    private var settings: [String: Any] = [:]
    private var preferences: [String: [String]] = [:]
    
    /// 크래시 23: UserDefaults 강제 캐스팅 — 타입 변경된 설정값
    func getNotificationPreference() -> Bool {
        let value = settings["notification_enabled"]!  // 키 없으면 크래시
        return value as! Bool                           // String "true"면 크래시
    }
    
    /// 크래시 24: 빈 배열 first + 강제 언래핑 체이닝
    func getPrimaryLanguage() -> String {
        let languages = preferences["languages"]!  // 키 없으면 크래시
        return languages.first!                     // 배열 비어있으면 크래시
    }
    
    /// 크래시 25: String to Int 강제 변환
    func getUserAge() -> Int {
        let ageString = settings["age"] as! String  // age가 Int로 저장되어 있으면 크래시
        return Int(ageString)!                       // "twenty"같은 문자열이면 크래시
    }
}
