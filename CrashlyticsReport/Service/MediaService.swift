//
//  MediaService.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/17/26.
//

import Foundation

class MediaService {
    static let shared = MediaService()
    private var playlist: [MediaItem] = []
    private var downloadQueue: [String] = []
    
    /// 크래시 20: 빈 배열 randomElement 강제 언래핑
    func getShuffledTrack() -> MediaItem {
        return playlist.randomElement()!  // 빈 배열이면 크래시
    }
    
    /// 크래시 21: 음수 인덱스 계산 오류 — 이전 트랙 이동
    func getPreviousTrack(currentIndex: Int) -> MediaItem {
        let prevIndex = currentIndex - 1  // currentIndex가 0이면 -1
        return playlist[prevIndex]         // 음수 인덱스 → 크래시
    }
    
    /// 크래시 22: Double → Int 변환 시 범위 초과
    func getTrackProgress(current: Double, total: Double) -> Int {
        let percentage = (current / total) * 100
        return Int(exactly: percentage)!  // 소수점이면 크래시 (Int(exactly:)는 정확히 변환 안 되면 nil)
    }
}
