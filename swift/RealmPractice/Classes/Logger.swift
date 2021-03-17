//
//  Logger.swift
//
//  Created by Paolo Manna on 23/02/2021.
//  Adapted from https://stackoverflow.com/a/58697135
//

import Foundation

let knownCommands: Set<String>	= ["AddColumn", "AddInteger", "AddTable",
                              	   "ArrayErase", "ArrayInsert", "ArrayMove", "ArraySet",
                              	   "Clear", "ContainerInsert", "ContainerSet", "CreateObject",
                              	   "EraseColumn", "EraseObject", "EraseTable", "InternStrings",
                              	   "SelectField", "SelectTable", "Set", "Update"]

enum Logger {
	static let formatter = ISO8601DateFormatter()
	static var analyseTrace = false
	static var verbose = false
	static var callback: ((String) -> Void)?
	static var createdObjects	= Set<String>()
	static var erasedObjects	= Set<String>()
	
	static var logFile: URL? = {
		let fm	= FileManager.default
		
		guard let documentsDirectory = fm.urls(for: .documentDirectory, in: .userDomainMask).first else { return nil }
		
		formatter.formatOptions	= [.withFullDate]
		formatter.timeZone		= TimeZone(secondsFromGMT: 0)
		
		var progressive	= 0
		var fileURL: URL!
		
		repeat  {
			progressive += 1
			
			let fileName	= String(format: "%@.%@_%03d.log",
			            	         Bundle.main.bundleIdentifier ?? "??", formatter.string(from: Date()), progressive)
			
			fileURL	= documentsDirectory.appendingPathComponent(fileName)
		} while fm.fileExists(atPath: fileURL.path) && progressive < 1000
		
		formatter.formatOptions	= [.withFullDate, .withFullTime]
		
		return fileURL
	}()
	
	fileprivate static func fileOutput(_ message: String) {
		guard let logFile = logFile else { return }
		
		let timestamp = formatter.string(from: Date())
		guard let data = ("[\(timestamp)]: " + message + "\n").data(using: String.Encoding.utf8) else { return }
		
		if FileManager.default.fileExists(atPath: logFile.path) {
			if let fileHandle = try? FileHandle(forWritingTo: logFile) {
				fileHandle.seekToEndOfFile()
				fileHandle.write(data)
				fileHandle.closeFile()
			}
		} else {
			try? data.write(to: logFile, options: .atomicWrite)
		}
	}
	
	fileprivate static func logCallback(_ message: String) {
		guard let logBack = callback else { return }
		
		DispatchQueue.main.async { logBack(message) }
	}
	
	fileprivate static func format(dictionary: [String: Any]) -> String {
		let keys		= dictionary.keys.sorted()
		var compound	= ""
		
		for key in keys {
			compound.append("\(key): \(dictionary[key] ?? 0) | ")
		}
		
		return compound
	}
	
	fileprivate static func parseTrace(message: String) {
		if message.contains("Changeset (parsed)") {
			var operations		= [String: Int]()
			var warnings		= [String: Int]()
			let messageLines	= message.components(separatedBy: "\n")
			
			for line in messageLines {
				let params	= line.components(separatedBy: " ").filter { !$0.isEmpty }
				
				if !(params.isEmpty || params[0].starts(with: "Connection[")) {
					let command	= params[0]
					
					if knownCommands.contains(command) {
						if let count = operations[command] {
							operations[command] = count + 1
						} else {
							operations[command] = 1
						}
						
						switch command {
						case "EraseObject":
							let objectId	= params[1]
							
							if createdObjects.contains(objectId) {
								// Format is `path=<Collection>[ObjectId{<id>}]`
								let objectComponents	= objectId.components(separatedBy: CharacterSet(charactersIn: "=[]{}"))
								let collectionName		= objectComponents[1]
								
								if let count = warnings["Erase existing \(collectionName)"] {
									warnings["Erase existing \(collectionName)"] = count + 1
								} else {
									warnings["Erase existing \(collectionName)"] = 1
								}
								createdObjects.remove(objectId)
								erasedObjects.insert(objectId)
							}
						case "CreateObject":
							let objectId	= params[1]
							
							if erasedObjects.contains(objectId) {
								let objectComponents	= objectId.components(separatedBy: CharacterSet(charactersIn: "=[]{}"))
								let collectionName		= objectComponents[1]
								
								if let count = warnings["Re-creating erased \(collectionName)"] {
									warnings["Re-creating erased \(collectionName)"] = count + 1
								} else {
									warnings["Re-creating erased \(collectionName)"] = 1
								}
								erasedObjects.remove(objectId)
							} else if createdObjects.contains(objectId) {
								// This is a serious error: trying to create an existing object
								logCallback("Re-creating an existing ID: \(objectId)")
							}
							createdObjects.insert(objectId)
						default:
							break
						}
					}
				}
			}
			
			if !operations.isEmpty {
				let opString	= format(dictionary: operations)
				
				if verbose {
					logCallback(opString)
				}
				fileOutput(opString)
			}
			
			if !warnings.isEmpty {
				let opString	= format(dictionary: warnings)
				
				logCallback("Warnings: \(opString)")
				fileOutput(opString)
			}
		}
	}
	
	static func log(level: UInt, message: String) {
		if analyseTrace, level == 7 {
			// Analyse Trace messages
			parseTrace(message: message)
		} else {
			fileOutput("Sync: (\(level)) \(message)")
		}
	}
}
