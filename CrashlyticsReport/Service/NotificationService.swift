//
//  NotificationService.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/17/26.
//

import Foundation

class NotificationService {
    static let shared = NotificationService()
    private var notifications: [Notification] = []
    private var badgeCounts: [String: Int] = [:]
    
    /// 크래시 17: 딥링크 URL 강제 언래핑 + 경로 파싱
    func handleNotification(_ notification: Notification) {
        let deepLink = notification.deepLink!  // nil이면 크래시
        let url = URL(string: deepLink)!       // 잘못된 URL이면 크래시
        let pathComponents = url.pathComponents
        let targetId = pathComponents[2]        // 경로 부족하면 크래시
        print("Navigate to: \(targetId)")
    }
    
    /// 크래시 18: payload 딕셔너리 강제 캐스팅
    func getNotificationTitle(_ notification: Notification) -> String {
        let payload = notification.payload!
        let title = payload["title"] as! String        // 키 없거나 타입 다르면 크래시
        let count = payload["count"] as! Int           // null일 수 있음
        return "\(title) (\(count))"
    }
    
    /// 크래시 19: 뱃지 카운트 오버플로우
    func incrementBadge(for category: String) -> Int {
        let current = badgeCounts[category]!  // 키 없으면 크래시
        let newCount = current &+ Int.max     // 오버플로우 유발
        badgeCounts[category] = newCount
        return newCount
    }
}
