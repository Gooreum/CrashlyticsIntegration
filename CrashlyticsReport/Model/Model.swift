//
//  Model.swift
//  CrashlyticsReport
//
//  Created by Mingu Seo on 2/17/26.
//

import Foundation

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
