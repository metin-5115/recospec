/**
 * Importing this module registers every built-in adapter in `ADAPTER_REGISTRY`. It is the single
 * place that knows the list; callers import it instead of repeating four side-effect imports.
 */
import './playwright-ts'
import './cypress'
import './selenium-py'
import './selenium-java'
