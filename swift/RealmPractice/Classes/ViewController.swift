//
//  ViewController.swift
//  RealmPractice
//
//  Created by Paolo Manna on 21/01/2021.
//

import RealmSwift
import UIKit

// Constants
let partitionValue	= "<Partition Value>"
let realmFolder		= "mongodb-realm"
let username		= ""
let password		= ""
let userAPIKey		= ""
let appId			= "<Realm App ID>"

let appConfig		= AppConfiguration(baseURL: nil, transport: nil, localAppName: nil,
             		                   localAppVersion: nil, defaultRequestTimeoutMS: 15000)
let app				= App(id: appId, configuration: appConfig)
let documentsURL	= URL(fileURLWithPath: NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true).first!)

// NOTE: The class of the objects handled here is set at TestData, change it to the one in your app
class TestData: Object {
	@objc dynamic var _id = ObjectId.generate()
	@objc dynamic var _partition: String = ""
	let doubleValue = RealmOptional<Double>()
	let longInt = RealmOptional<Int>()
	let mediumInt = RealmOptional<Int>()
	
	override static func primaryKey() -> String? {
		return "_id"
	}
}

func syncLog(level: SyncLogLevel, message: String) {
	Logger.log("Sync: (\(level.rawValue)) \(message)")
}

class ViewController: UIViewController {
	let dateFormatter	= ISO8601DateFormatter()
	let numFormatter	= NumberFormatter()
	var textView: UITextView!
	var addButton: UIButton!
	var realm: Realm?
	var objects: Results<TestData>!
	var notificationToken: NotificationToken?
	var progressToken: SyncSession.ProgressNotificationToken?

	func log(_ text: String) {
		textView.text += "[\(dateFormatter.string(from: Date()))] - \(text)\n"
	}
	
	override func viewDidLoad() {
		super.viewDidLoad()
		
		// Do any additional setup after loading the view.
		dateFormatter.formatOptions	= [.withFullDate, .withFullTime]
		dateFormatter.timeZone		= TimeZone(secondsFromGMT: 0)
		
		numFormatter.numberStyle	= .decimal
		
		view.backgroundColor	= .systemBackground
		
		var textFrame			= view.bounds
		
		textFrame.origin.y		+= 20.0
		textFrame.size.height	-= 60.0

		textView					= UITextView(frame: textFrame)
		textView.autoresizingMask	= [.flexibleWidth, .flexibleHeight]
		textView.font				= UIFont.monospacedSystemFont(ofSize: 11.0, weight: .regular)
		
		view.addSubview(textView)
		
		let buttonFrame			= CGRect(x: textFrame.origin.x, y: textFrame.origin.y + textFrame.height,
		               			         width: textFrame.width, height: 40.0)
		
		addButton				= UIButton(frame: buttonFrame)
		
		addButton.autoresizingMask	= [.flexibleWidth, .flexibleTopMargin]
		addButton.setTitle("Add Items", for: .normal)
		addButton.setTitleColor(.blue, for: .normal)
		addButton.addTarget(self, action: #selector(insertTestData), for: .touchUpInside)
		
		view.addSubview(addButton)

		log("Application started")
		
		app.syncManager.logLevel	= .detail
		app.syncManager.logger		= syncLog

		if let user = app.currentUser {
			log("Skipped login, syncing…")
			
			openRealm(for: user)
		} else {
			let credentials: Credentials!
			
			if !username.isEmpty {
				credentials	= .emailPassword(email: username, password: password)
			} else if !userAPIKey.isEmpty {
				credentials	= .userAPIKey(userAPIKey)
			} else {
				credentials	= .anonymous
			}
			
			app.login(credentials: credentials) { [weak self] result in
				DispatchQueue.main.async {
					switch result {
					case let .success(user):
						// This is the part that reads the objects via Sync
						self?.log("Logged in, syncing…")
						
						self?.openRealm(for: user)
					case let .failure(error):
						self?.log("Error: \(error.localizedDescription)")
					}
				}
			}
		}
	}
	
	// MARK: - Realm operations
	
	fileprivate func realmBackup(from backupPath: String, to realmFileURL: URL) {
		let backupURL	= realmFileURL.deletingPathExtension().appendingPathExtension("~realm")
		let fm			= FileManager.default
		
		do {
			// Delete file if present
			if fm.fileExists(atPath: backupURL.path) {
				try fm.removeItem(at: backupURL)
			}
			
			// Make a copy of the current realm
			try fm.moveItem(atPath: backupPath, toPath: backupURL.path)
			
			log("Realm backup successful")
		} catch {
			log("Realm backup failed: \(error.localizedDescription)")
		}
	}
	
	fileprivate func realmRestore() {
		guard let realm = realm, let realmFileURL = realm.configuration.fileURL else {
			log("No realm to restore")
			return
		}

		let backupURL	= realmFileURL.deletingPathExtension().appendingPathExtension("~realm")
		let fm			= FileManager.default

		guard fm.fileExists(atPath: backupURL.path) else {
			log("No backup found at \(backupURL.lastPathComponent) to apply")
			return
		}
		
		let config = Realm.Configuration(fileURL: backupURL,
		                                 readOnly: true)
		
		guard let backupRealm = try? Realm(configuration: config) else {
			// Failed, clean backup file
			log("Error applying restore")
			try? fm.removeItem(at: backupURL)
			return
		}
		
		// This part needs to be tailored for the specific realm we're restoring
		// In a nutshell, we need to read all collections that may have been modified by the user
		// and report all changes back to the fresh realm
		let oldObjects	= backupRealm.objects(TestData.self)
		
		do {
			try realm.write {
				// Reads all objects, and applies changes
				for anObject in oldObjects {
					realm.create(TestData.self, value: anObject, update: .modified)
				}
			}
			
			log("Restore successfully applied")
			try fm.removeItem(at: backupURL)
		} catch {
			log("Restore failed: \(error.localizedDescription)")
		}
	}
	
	func realmExists(for user: User) -> Bool {
		if let realmFileURL	= user.configuration(partitionValue: partitionValue).fileURL {
			return FileManager.default.fileExists(atPath: realmFileURL.path)
		}
		
		// Approximate substitute, just check if the user folder is around
		let userDirectoryURL	= documentsURL.appendingPathComponent(realmFolder).appendingPathComponent(appId).appendingPathComponent(user.id)
		
		return FileManager.default.fileExists(atPath: userDirectoryURL.path)
	}
	
	// This is used only for sync opening: for async, we attach to the AsyncOpenTask instead
	func realmSetupProgress(for session: SyncSession?) {
		guard let session = session else {
			log("Invalid session for progress notification")
			
			return
		}
		
		progressToken	= session.addProgressNotification(for: .download,
		             	                                  mode: .reportIndefinitely) { [weak self] progress in
			if progress.isTransferComplete {
				self?.progressToken?.invalidate()
				self?.progressToken	= nil
				
				DispatchQueue.main.async { [weak self] in
					self?.log("Transfer finished")
				}
			} else {
				DispatchQueue.main.async { [weak self] in
					guard let self = self else { return }
					
					let transferredStr		= self.numFormatter.string(from: NSNumber(value: progress.transferredBytes))
					let transferrableStr	= self.numFormatter.string(from: NSNumber(value: progress.transferrableBytes))
					
					self.log("Transferred \(transferredStr ?? "??") of \(transferrableStr ?? "??")…")
				}
			}
		}
	}
	
	func realmSetupClientReset() {
		// Don't re-do it
		guard app.syncManager.errorHandler == nil else { return }
		
		app.syncManager.errorHandler	= { [weak self] error, session in
			let syncError	= error as! SyncError
			var fileURL: URL?
//			var fileURL		= self?.realm?.configuration.fileURL
			
			// Extract failing partition from the session, detect which fileURL we're going to backup
			if let partition = session?.configuration()?.partitionValue as? String {
				fileURL	= app.currentUser?.configuration(partitionValue: partition).fileURL
			}
			
			switch syncError.code {
			case .clientResetError:
				if let (path, clientResetToken) = syncError.clientResetInfo() {
					DispatchQueue.main.async { [weak self] in
						guard let self = self, let realmConfigURL = fileURL else { return }
						
						self.log("The database is out of sync, resetting client…")
						
						self.realmCleanup()
						
						// This clears the old realm files and makes a backup in `recovered-realms`
						SyncSession.immediatelyHandleError(clientResetToken, syncManager: app.syncManager)
						
						// Copy from the auto-generated backup to a known location
						self.realmBackup(from: path, to: realmConfigURL)
						
						// At this point, realm is gone, so user can be advised to quit and re-enter app (or at least logout)
						// Here we just retry to open the same realm again: YMMV
						DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
							self?.log("Trying to re-open realm…")
							self?.openRealm(for: app.currentUser!)
						}
					}
				}
			default:
				print("SyncManager error: ", error.localizedDescription)
			}
		}
	}
	
	fileprivate func realmSyncOpen(with user: User) {
		let config	= user.configuration(partitionValue: partitionValue)
		
		realmSetupClientReset()
		
		do {
			realm = try Realm(configuration: config)
			
			log("Opened \(partitionValue) Realm (sync)")
			
			realmSetupProgress(for: realm?.syncSession)
			
			realmRestore()
			realmSetup()
		} catch {
			log("Error: \(error.localizedDescription)")
			realmCleanup(delete: true)
		}
	}
	
	fileprivate func realmAsyncOpen(with user: User) {
		let config	= user.configuration(partitionValue: partitionValue)
		
		realmSetupClientReset()

		let task	= Realm.asyncOpen(configuration: config,
		        	                  callbackQueue: DispatchQueue.main) { [weak self] result in
			switch result {
			case let .success(openRealm):
				self?.realm = openRealm
				
				self?.log("Opened \(partitionValue) Realm (async)")
				
				self?.realmRestore()
				self?.realmSetup()
				
			case let .failure(error):
				self?.log("Error: \(error.localizedDescription)")
				self?.realmCleanup(delete: false)
			}
		}
		
		task.addProgressNotification(queue: .main) { [weak self] progress in
			if progress.isTransferComplete {
				self?.log("Transfer finished")
			} else {
				guard let self = self else { return }
				
				let transferredStr		= self.numFormatter.string(from: NSNumber(value: progress.transferredBytes))
				let transferrableStr	= self.numFormatter.string(from: NSNumber(value: progress.transferrableBytes))
				
				self.log("Transferred \(transferredStr ?? "??") of \(transferrableStr ?? "??")…")
			}
		}
	}
	
	func openRealm(for user: User) {
		// It's suggested that async is used at first launch, sync after
		// This check is very simple: when opening multiple realms,
		// or recovering from a client reset, you may want to have a smarter one
		if realmExists(for: user) {
			realmSyncOpen(with: user)
		} else {
			realmAsyncOpen(with: user)
		}
	}
	
	func realmSetup() {
		guard let realm = realm else {
			log("No realm defined")
			
			return
		}
		
		// Access objects in the realm, sorted by _id so that the ordering is defined.
		objects = realm.objects(TestData.self).sorted(byKeyPath: "_id")

		guard objects != nil else {
			log("Error: No objects found")
			
			return
		}
		
		// Observe the projects for changes.
		notificationToken = objects.observe { [weak self] changes in
			switch changes {
			case .initial:
				// Results are now populated and can be accessed without blocking the UI
				self?.log("Initial load change")
			case let .update(_, deletions, insertions, modifications):
				// Query results have changed, so apply them
				self?.log("Received \(deletions.count) deleted, \(insertions.count) inserted, \(modifications.count) updates")
			case let .error(error):
				// An error occurred while opening the Realm file on the background worker thread
				self?.log("Error: \(error.localizedDescription)")
			}
		}
		
		log("Number of objects obtained: \(objects.count)")
	}
	
	func realmCleanup(delete: Bool = false) {
		// Invalidate progress, if set
		progressToken?.invalidate()
		progressToken		= nil
		
		guard let realm = realm else { return }
		
		// Invalidate observer
		notificationToken?.invalidate()
		notificationToken	= nil
		
		// Clear results list
		objects	= nil
		
		// Invalidate and clear the realm itself
		realm.invalidate()
		self.realm	= nil
		
		log("Closed \(partitionValue) Realm")
		
		if delete {
			guard let config = app.currentUser?.configuration(partitionValue: partitionValue) else { return }
			
			// Deleting immediately doesn't work, introduce a small wait
			DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
				do {
					_	= try Realm.deleteFiles(for: config)
					
					self?.log("Deleted realm files")
				} catch {
					self?.log("Error: \(error.localizedDescription)")
				}
			}
		}
	}
	
	// MARK: - DB Fill in - just an example here
	
	fileprivate func createDocument() -> TestData {
		let document	= TestData()
		
		document._partition			= partitionValue
		document.doubleValue.value	= Double(arc4random_uniform(100000)) / 100.0
		document.longInt.value		= Int(arc4random_uniform(1000000))
		document.mediumInt.value	= Int(arc4random_uniform(1000))

		return document
	}
	
	fileprivate func createDocumentList() -> [TestData] {
		var docList	= [TestData]()
		
		for _ in 0 ..< 500 {
			let document	= createDocument()
			
			docList.append(document)
		}
		
		return docList
	}
	
	@IBAction func insertTestData() {
		do {
			let documentList	= createDocumentList()
			
			try realm?.write { [weak self] in
				self?.realm?.add(documentList, update: .modified)
			}
			log("Inserted: \(documentList.count) documents")
		} catch {
			log("Error inserting: \(error.localizedDescription)")
		}
	}
}
