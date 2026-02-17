//
//  CacheManager.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/17/26.
//

import Foundation
import UIKit

class CacheManager {
    static let shared = CacheManager()
    private var memoryCache: NSCache<NSString, AnyObject> = NSCache()
    private var diskPaths: [String] = []
    
    /// 크래시 26: NSCache 강제 캐스팅 — 타입 불일치
    func getCachedImage(key: String) -> UIImage {
        let cached = memoryCache.object(forKey: key as NSString)!  // nil이면 크래시
        return cached as! UIImage                                    // 타입 다르면 크래시
    }
    
    /// 크래시 27: FileManager 강제 언래핑 — 존재하지 않는 경로
    func getCacheFileSize(at index: Int) -> UInt64 {
        let path = diskPaths[index]  // 범위 초과면 크래시
        let attrs = try! FileManager.default.attributesOfItem(atPath: path)  // 파일 없으면 크래시
        return attrs[.size] as! UInt64
    }
}
