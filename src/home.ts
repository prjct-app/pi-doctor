// pi-doctor keeps its data outside Pi's folder, at ${PRJCT_HOME:-~/.prjct}/pi-doctor, like every prjct extension.
import { homedir } from "node:os";
import { join } from "node:path";

export const prjctHome = () => process.env.PRJCT_HOME ?? join(homedir(), ".prjct");
export const doctorHome = () => join(prjctHome(), "pi-doctor");
export const backupRoot = () => join(doctorHome(), "backups");
